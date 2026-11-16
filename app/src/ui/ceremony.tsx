import { createContext, useContext } from "react";

export type CeremonyStage = "folding" | "dropping" | "stamping";
export interface CeremonyState {
  stage: CeremonyStage;
  /** The progress sentence (what is really happening: waking the Postman, checking, wrapping, pressing the wax). */
  text: string;
  /** True once the first step is taking long (the helper was asleep). */
  slow: boolean;
}

export interface CeremonyApi {
  show: (s: CeremonyState) => void;
  update: (p: Partial<CeremonyState>) => void;
  hide: () => void;
}

const noop: CeremonyApi = { show: () => {}, update: () => {}, hide: () => {} };
export const CeremonyContext = createContext<CeremonyApi>(noop);
export const useCeremony = () => useContext(CeremonyContext);
