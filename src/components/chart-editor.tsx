"use client";

import { useActionState, useState } from "react";
import { saveChart } from "@/lib/actions/songs";
import { MAJOR_KEYS, MINOR_KEYS, classifyLine, guessKey, parseChord } from "@/lib/chords";
import { FormMessage, SubmitButton } from "@/components/form";
import { ChartViewer } from "@/components/chart-viewer";

const BOLD = "font-bold";

// One typed line with its chords and headings in bold. Bold must not change
// any character's width or the overlay drifts off the text being typed, which
// is why the editor uses a monospace font.
function HighlightedLine({ raw }: { raw: string }) {
  const line = classifyLine(raw);

  if (line.type === "section") return <span className="font-bold">{raw}</span>;

  if (line.type === "chords") {
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const token of line.tokens) {
      // Tabs were widened to spaces for parsing, so find each token in the raw text.
      const start = raw.indexOf(token.text, at);
      parts.push(raw.slice(at, start));
      parts.push(
        token.chord || token.heading ? (
          <span key={start} className={BOLD}>
            {token.text}
          </span>
        ) : (
          token.text
        )
      );
      at = start + token.text.length;
    }
    parts.push(raw.slice(at));
    return <>{parts}</>;
  }

  if (line.type === "lyric" && (raw.includes("[") || line.label)) {
    // Tabs were widened to spaces for parsing, so find the label's colon in the raw text.
    const labelEnd = line.label ? raw.indexOf(":") + 1 : 0;
    // split() with a capture group keeps the bracketed pieces at odd positions.
    return (
      <>
        {labelEnd > 0 && <span className={BOLD}>{raw.slice(0, labelEnd)}</span>}
        {raw.slice(labelEnd).split(/(\[[^\]\s]+\])/).map((part, i) =>
          i % 2 === 1 && parseChord(part.slice(1, -1)) ? (
            <span key={i} className={BOLD}>
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  }

  return <>{raw}</>;
}

const TEXT_BOX = "m-0 whitespace-pre-wrap break-words chart-font p-3 text-sm leading-6";

export function ChartEditor({
  songId,
  arrangementId,
  initialText,
  initialKey,
  title,
  author,
}: {
  songId: string;
  arrangementId: string;
  initialText: string;
  initialKey: string;
  title: string;
  author: string | null;
}) {
  const [state, formAction] = useActionState(saveChart, undefined);
  const [text, setText] = useState(initialText);
  const [chartKey, setChartKey] = useState(initialKey);
  const guess = chartKey ? null : guessKey(text);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <input type="hidden" name="songId" value={songId} />
      <input type="hidden" name="arrangementId" value={arrangementId} />

      <section className="card flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Written in the key of
            <select name="chartKey" value={chartKey} onChange={(e) => setChartKey(e.target.value)} className="input mt-1 !w-28 font-normal">
              <option value="">—</option>
              {chartKey && ![...MAJOR_KEYS, ...MINOR_KEYS].includes(chartKey) && <option>{chartKey}</option>}
              <optgroup label="Major">
                {MAJOR_KEYS.map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </optgroup>
              <optgroup label="Minor">
                {MINOR_KEYS.map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </optgroup>
            </select>
          </label>
          {guess && (
            <button type="button" onClick={() => setChartKey(guess)} className="link cursor-pointer pb-2 text-sm">
              Looks like {guess}. Use it?
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <FormMessage state={state} />
            <SubmitButton pendingLabel="Saving…">Save chart</SubmitButton>
          </div>
        </div>

        {/* The textarea sits exactly on top of a highlighted copy of its own
            text; its letters are transparent, so only the copy shows. */}
        <div className="relative rounded-lg border border-black/15 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-white/20 dark:bg-neutral-950">
          <pre aria-hidden="true" className={`${TEXT_BOX} min-h-96`}>
            {text.split("\n").map((raw, i) => (
              <span key={i}>
                <HighlightedLine raw={raw} />
                {"\n"}
              </span>
            ))}
          </pre>
          <textarea
            name="chart"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Chord chart"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={"Verse 1\nG          C         G\nAmazing grace, how sweet the sound"}
            className={`${TEXT_BOX} absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-neutral-900 outline-none placeholder:text-neutral-400 dark:caret-white`}
          />
        </div>

        <details className="text-sm">
          <summary className="link cursor-pointer">How to type a chart</summary>
          <ul className="muted mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>Put a line of chords directly above the lyric line it belongs to, lining each chord up over its syllable.</li>
            <li>
              Or put chords in brackets inside the lyrics: <code>[G]Amazing [C]grace</code>.
            </li>
            <li>
              You can type Nashville numbers instead of letters: <code>1 4 6m 5/7 b7</code>. Use <code>m</code> or <code>-</code> for minor.
            </li>
            <li>
              A line like <code>Verse 1</code>, <code>Chorus</code>, <code>Bridge x2</code>, or anything ending in a colon becomes a heading.
              A heading can also start a line: <code>Intro: G C D</code> or <code>Verse: lyrics here</code>.
            </li>
            <li>
              Bars and repeats are fine on a chord line: <code>| G / / / | C / / / | x2</code>.
            </li>
            <li>
              A bass note on its own (<code>/E</code>) and remarks in parentheses (<code>(Intro)</code>, <code>(to Chorus)</code>) are fine on a
              chord line.
            </li>
            <li>Chords and headings turn bold as you type. Anything not bold is being read as lyrics.</li>
            <li>
              Bars work too, with or without spaces: <code>|Bm - - - |G - D/F# - |</code>. A whole line has to be chords, bars and dashes to count; one stray word makes it
              lyrics.
            </li>
          </ul>
        </details>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold print:hidden">Preview</h2>
        <ChartViewer
          text={text}
          chartKey={chartKey || null}
          title={title}
          author={author}
        />
      </section>
    </form>
  );
}
