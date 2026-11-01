"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE } from "@/lib/chart-pages";
import { Icon } from "@/components/ui";

export type OrderRow =
  | { kind: "header"; title: string; preService: boolean }
  | { kind: "row"; time: string | null; title: string; song: boolean; placeholder: boolean; tag: boolean; key: string | null; length: string | null; notes: string | null };

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      <Icon name="print" className="h-4 w-4" />
      Print or save as PDF
    </button>
  );
}

// The service order on one Letter sheet, the first page of a service's printout.
// Like a chart page it is drawn at its printed size and shrunk to fit on screen.
// A long order gets smaller type so it still fits on the one sheet.
export function OrderSheet({
  title,
  subtitle,
  times,
  notes,
  rows,
  team,
  total,
}: {
  title: string;
  subtitle: string;
  times: string[];
  notes: string | null;
  rows: OrderRow[];
  team: { position: string; names: string[] }[];
  total: string | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // 1pt is 4/3 CSS pixels.
    const fit = () => {
      if (element.clientWidth > 0) setZoom(Math.min(1, element.clientWidth / ((PAGE.width * 4) / 3)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const lines = rows.length + rows.filter((row) => row.kind === "row" && row.notes).length + Math.ceil(team.length / 3) + 2;
  const size = lines > 34 ? 8.5 : lines > 26 ? 9.5 : 11;

  return (
    <div ref={frame} className="flex flex-col items-center print:block">
      <div
        className="chart-page first-sheet relative shrink-0 overflow-hidden bg-white font-sans text-black shadow-md ring-1 ring-black/10 [zoom:var(--zoom)] print:shadow-none print:ring-0 print:[zoom:1]"
        style={
          {
            "--zoom": zoom,
            width: `${PAGE.width}pt`,
            height: `${PAGE.height - 2}pt`,
            padding: `${PAGE.marginTop}pt ${PAGE.marginSide}pt ${PAGE.marginBottom}pt`,
            fontSize: `${size}pt`,
            lineHeight: 1.3,
          } as React.CSSProperties
        }
      >
        <header className="sheet-header flex items-start justify-between gap-4 bg-neutral-200" style={{ padding: "6pt 12pt", marginBottom: "10pt" }}>
          <div className="min-w-0">
            <div className="truncate font-bold" style={{ fontSize: "16pt", lineHeight: "20pt" }}>
              {title}
            </div>
            <div style={{ fontSize: "9pt" }}>{subtitle}</div>
          </div>
          <div className="shrink-0 text-right font-bold uppercase" style={{ fontSize: "9pt", letterSpacing: "0.08em", lineHeight: "20pt" }}>
            Service order
          </div>
        </header>

        {(times.length > 0 || notes) && (
          <div style={{ marginBottom: "8pt", fontSize: "0.9em" }}>
            {times.length > 0 && <div className="font-semibold">{times.join("   ·   ")}</div>}
            {notes && <div className="whitespace-pre-wrap">{notes}</div>}
          </div>
        )}

        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, index) =>
              row.kind === "header" ? (
                <tr key={index}>
                  <td colSpan={4} className="border-b border-black font-bold uppercase" style={{ paddingTop: index === 0 ? 0 : "7pt", letterSpacing: "0.08em", fontSize: "0.85em" }}>
                    {row.title}
                    {row.preService && <span className="font-semibold normal-case tracking-normal"> · before the start time</span>}
                  </td>
                </tr>
              ) : (
                <tr key={index} className="border-b border-neutral-300 align-top">
                  <td className="whitespace-nowrap tabular-nums" style={{ width: "54pt", padding: "2.5pt 0" }}>
                    {row.time}
                  </td>
                  <td style={{ padding: "2.5pt 6pt 2.5pt 0" }}>
                    {row.tag && (
                      <span className="mr-1 rounded-sm border border-black px-1 font-black" style={{ fontSize: "0.75em" }}>
                        TAG
                      </span>
                    )}
                    <span className={row.song ? (row.placeholder ? "italic" : "font-semibold") : undefined}>{row.title}</span>
                    {row.notes && (
                      <div className="whitespace-pre-wrap text-neutral-700" style={{ fontSize: "0.85em" }}>
                        {row.notes}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right font-bold" style={{ width: "34pt", padding: "2.5pt 6pt 2.5pt 0" }}>
                    {row.key}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums" style={{ width: "36pt", padding: "2.5pt 0" }}>
                    {row.length}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {total && (
          <div className="text-right font-semibold" style={{ marginTop: "4pt", fontSize: "0.9em" }}>
            {total}
          </div>
        )}

        {team.length > 0 && (
          <div style={{ marginTop: "12pt" }}>
            <div className="border-b border-black font-bold uppercase" style={{ letterSpacing: "0.08em", fontSize: "0.85em", marginBottom: "3pt" }}>
              Team
            </div>
            <div className="grid grid-cols-3" style={{ columnGap: "12pt", rowGap: "2pt", fontSize: "0.9em" }}>
              {team.map((slot) => (
                <div key={slot.position} className="min-w-0">
                  <span className="font-semibold">{slot.position}:</span> {slot.names.join(", ")}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
