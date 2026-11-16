/** How long Alex can go quiet before the letter starts to open, and the warning before it does. */
export type WhenId = "3m" | "6m" | "12m" | "demo";

export interface WhenOption {
  id: WhenId;
  label: string;
  /** seconds of quiet before the countdown starts */
  quiet: number;
  /** seconds of countdown (the "Warning" period) before the letter opens */
  warning: number;
  /** only shown after the secret gesture / ?demo */
  hidden?: boolean;
}

const DAY = 86_400;
export const WARNING_DAYS = 14;

export const WHEN_OPTIONS: WhenOption[] = [
  { id: "3m", label: "3 months", quiet: 90 * DAY, warning: WARNING_DAYS * DAY },
  { id: "6m", label: "6 months", quiet: 180 * DAY, warning: WARNING_DAYS * DAY },
  { id: "12m", label: "12 months", quiet: 365 * DAY, warning: WARNING_DAYS * DAY },
  { id: "demo", label: "2 minutes (demo)", quiet: 120, warning: 60, hidden: true },
];

export const whenById = (id: WhenId): WhenOption => WHEN_OPTIONS.find((o) => o.id === id) ?? WHEN_OPTIONS[1]!;
