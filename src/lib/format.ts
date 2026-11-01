// Date, time and length helpers. Safe to import from client components.
//
// Plan dates are calendar dates (stored as UTC midnight) and start times are
// "HH:MM" wall-clock strings, so nothing here converts between timezones.

// "4:30" -> 270, "4" -> 240 (a bare number is minutes), "" -> null.
export function parseLength(input: string): number | null {
  const value = input.trim();
  if (value === "") return null;
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(value);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

// Which rows happen before the service: a Pre-service header and everything under it,
// up to the next header.
export function preServiceRows(items: { type: string; preService: boolean }[]) {
  let early = false;
  return items.map((item) => {
    if (item.type === "HEADER") early = item.preService;
    return early;
  });
}

// When each plan row starts, in seconds from the service's start time.
// Pre-service rows (see preServiceRows) are timed backwards from the start: each starts its own length
// before the next pre-service row, and the last of them ends at the start time.
// The other rows run one after another from the start time. `length` is how long
// the service itself runs.
export function itemStarts(items: { type: string; lengthSeconds: number | null; preService: boolean }[]) {
  const early = preServiceRows(items);
  let before = -items.reduce((sum, item, index) => sum + (early[index] ? (item.lengthSeconds ?? 0) : 0), 0);
  let length = 0;
  const starts = items.map((item, index) => {
    if (early[index]) {
      const at = before;
      before += item.lengthSeconds ?? 0;
      return at;
    }
    const at = length;
    length += item.lengthSeconds ?? 0;
    return at;
  });
  return { starts, length };
}

export function formatLength(seconds: number | null | undefined) {
  if (seconds == null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// "13:05" plus an offset in seconds -> "1:05 PM". Seconds are dropped.
export function formatClock(time: string, offsetSeconds = 0) {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + Math.floor(offsetSeconds / 60)) % 1440) + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

// "Rehearsal at 4:15 PM", or with its day when that isn't the day of the service:
// "Rehearsal on Thu, Oct 15 at 7:00 PM". One that hasn't been decided is "Rehearsal: TBD".
export function describePlanTime(planDate: Date, time: { label: string; date: Date | null; time: string | null }) {
  if (!time.date || !time.time) return `${time.label}: TBD`;
  const sameDay = time.date.getTime() === planDate.getTime();
  const day = time.date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  return `${time.label}${sameDay ? "" : ` on ${day}`} at ${formatClock(time.time)}`;
}

// Earliest first, with the ones still to be decided at the end.
export function sortPlanTimes<T extends { date: Date | null; time: string | null }>(times: T[]) {
  const when = (t: T) => (t.date && t.time ? t.date.getTime() : Infinity);
  return [...times].sort((a, b) => {
    if (when(a) !== when(b)) return when(a) < when(b) ? -1 : 1;
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
}

export function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatPlanDate(date: Date, style: "long" | "short" = "long") {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Today's calendar date in the given timezone, as UTC midnight.
export function todayInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${parts}T00:00:00Z`);
}

export function nextSunday(from: Date) {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date;
}

export function youtubeId(url: string) {
  const match = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return match ? match[1] : null;
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
