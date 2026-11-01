// Small visual building blocks shared across pages. No state, so they work in
// both server and client components.

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  plans: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  songs: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0-1-5.8M18 14.5a5.5 5.5 0 0 1 3.5 5.5",
  teams: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  chevron: "m9 6 6 6-6 6",
  back: "m15 6-6 6 6 6",
  sheet: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  print: "M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v7H7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  close: "M6 6l12 12M18 6 6 18",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  plus: "M12 5v14M5 12h14",
  // An arrow leaving a box.
  logout: "M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3M16 16l4-4-4-4M20 12H10",
  previous: "M6 5v14M19 5 9 12l10 7z",
  next: "M18 5v14M5 5l10 7-10 7z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  message: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  check: "m5 12 5 5 9-10",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-5 w-5", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "grip" ? 2.6 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// The app's mark, the same drawing as the home-screen icon: three rows of a service
// order, the current one lit. In the app it takes the colour theme's primary and
// highlight colours; the icon files themselves are fixed Ember.
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="100" height="100" rx="22" className="fill-indigo-600" />
      <circle cx="27" cy="31" r="5.5" className="fill-sage" />
      <rect x="38" y="27" width="40" height="8" rx="4" fill="#fff" />
      <circle cx="27" cy="50" r="5.5" fill="#fff" fillOpacity="0.55" />
      <rect x="38" y="46" width="32" height="8" rx="4" fill="#fff" fillOpacity="0.85" />
      <circle cx="27" cy="69" r="5.5" fill="#fff" fillOpacity="0.55" />
      <rect x="38" y="65" width="24" height="8" rx="4" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}

// The top-left corner: the church's own logo when an admin has uploaded one (Account page),
// otherwise the app's mark. Logos are usually dark ink on nothing, so it sits on white.
export function ChurchMark({ logoVersion, className = "h-8 w-8" }: { logoVersion: string | null; className?: string }) {
  if (!logoVersion) return <Logo className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small signed-in image; next/image adds nothing here
    <img src={`/logo?v=${logoVersion}`} alt="" className={`shrink-0 rounded-md bg-white object-contain p-px ${className}`} />
  );
}

// Muted, from the brand palette and its neighbours: Slate, Sage, Clay, and three earth tones.
const AVATAR_COLOURS = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200",
  "bg-sage/45 text-neutral-800 dark:bg-sage/20 dark:text-neutral-100",
  "bg-clay/20 text-[#6b4c40] dark:bg-clay/25 dark:text-[#e3c4b6]",
  "bg-amber-100/80 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  "bg-stone-200 text-stone-800 dark:bg-stone-400/20 dark:text-stone-200",
];

// A person's initials in a circle. The colour is picked from the name, so the
// same person is always the same colour.
export function Avatar({ name, className = "h-10 w-10 text-sm" }: { name: string; className?: string }) {
  const words = name.trim().split(/\s+/);
  const initials = ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
  const colour = AVATAR_COLOURS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLOURS.length];
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${colour} ${className}`}>{initials || "?"}</span>;
}

// A calendar-page tile for a plan's date ("OCT / 18"). Dates are calendar
// dates stored as UTC midnight, so they are read back in UTC.
export function DateTile({ date }: { date: Date }) {
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-100 leading-none text-neutral-800 dark:bg-white/10 dark:text-neutral-100">
      <span className="text-[11px] font-semibold uppercase tracking-wider">{date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}</span>
      <span className="mt-0.5 text-lg font-semibold tabular-nums">{date.getUTCDate()}</span>
    </span>
  );
}
