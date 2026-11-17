import type { ReactNode } from "react";

/** Thin line icons (1.25 px strokes), drawn on a 24 grid. Decorative: always hidden from screen readers. */
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
type P = { size?: number };
export const IconLetter = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
  </Icon>
);
export const IconPeople = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="3" />
    <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
    <circle cx="17" cy="9.5" r="2.2" />
    <path d="M16.5 14.6c2.3.1 3.7 1.5 4.2 4" />
  </Icon>
);
export const IconShield = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6l-7-2.5Z" />
    <path d="m9.2 12 2 2 3.6-4" />
  </Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const IconArrow = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
  </Icon>
);
export const IconBack = (p: P) => (
  <Icon {...p}>
    <path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5.5 12.5 4.2 4.2L18.5 8" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconSound = ({ on, size }: { on: boolean; size?: number }) => (
  <Icon size={size}>
    <path d="M4.5 10v4h3.2l4.3 3.5v-11L7.7 10H4.5Z" />
    {on ? <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" /> : <path d="m16 9.5 4 5M20 9.5l-4 5" />}
  </Icon>
);
export const IconUser = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="9" r="3.2" />
    <path d="M5.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" />
  </Icon>
);
export const IconPlay = (p: P) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10-6.5-10-6.5Z" />
  </Icon>
);
export const IconPause = (p: P) => (
  <Icon {...p}>
    <path d="M9 5.5v13M15 5.5v13" />
  </Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const IconChevL = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
);
export const IconChevR = (p: P) => (
  <Icon {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Icon>
);
export const IconReplay = (p: P) => (
  <Icon {...p}>
    <path d="M5 12a7 7 0 1 0 2.2-5.1M5 5v4h4" />
  </Icon>
);
export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 4.2v1.8M12 18v1.8M4.2 12H6M18 12h1.8M6.5 6.5l1.3 1.3M16.2 16.2l1.3 1.3M17.5 6.5l-1.3 1.3M7.8 16.2l-1.3 1.3" />
  </Icon>
);
export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M19 14.6A7.4 7.4 0 0 1 9.4 5 7.4 7.4 0 1 0 19 14.6Z" />
  </Icon>
);
export const IconCopy = (p: P) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="10" height="11" rx="2" />
    <path d="M15.5 8.5V6.2a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8.3a2 2 0 0 0 2 2h1.5" />
  </Icon>
);
