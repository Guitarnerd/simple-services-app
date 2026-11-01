// How a scheduling answer is worded and coloured. Safe to import anywhere.
export const STATUS_LABELS = { PENDING: "Waiting", CONFIRMED: "Confirmed", DECLINED: "Declined" } as const;
export type Status = keyof typeof STATUS_LABELS;

export const STATUS_STYLES: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  DECLINED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};
