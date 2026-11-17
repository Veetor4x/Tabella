import { m } from "framer-motion";
import type { ReactNode } from "react";
import type { LetterState, LetterView } from "../lib/registry";
import { longDay } from "../lib/periods";
import { countdown, ringText, span } from "../lib/time";
import { FlipDays } from "../ui/FlipDays";
import { Headline } from "../ui/Headline";
import { EASE } from "../ui/motion";
import { Ring } from "../ui/Ring";

export const STATE_NOTE: Record<LetterState, string> = {
  Sealed: "Sealed and waiting.",
  Warning: "Time is running out.",
  Opened: "Opened for the people you chose.",
  Cancelled: "Cancelled. Nobody can open it.",
};

export function StatePill({ state }: { state: LetterState }) {
  return <span className={`state-pill ${state.toLowerCase()}`}>{state}</span>;
}

/** "Next check-in in 28 days" / "Opens in 2 days unless you check in". */
export function nextLine(v: LetterView, now = Date.now()): string {
  const c = countdown(v, now);
  if (v.state === "Cancelled") return "Cancelled. Nobody can open it.";
  if (v.state === "Opened") return "Opened for the people you chose.";
  if (v.releaseAt) return `Opens on ${longDay(v.releaseAt)}.`;
  if (c.phase === "warning" || v.state === "Warning") return `Opens in ${span(c.left)} unless you check in.`;
  return `Next check-in in ${span(c.left)}`;
}

export const namesOf = (names: string[], addresses: string[]) => {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length === names.length && n.length) return n.length === 1 ? n[0]! : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
  return `${addresses.length} ${addresses.length === 1 ? "person" : "people"}`;
};

export type CheckInPhase = "idle" | "working" | "done";

/**
 * The check-in screen: a ring, and one big button. Presentational, so the walkthrough on the front page
 * can show the very same screen with sample data.
 */
export function CheckInView(props: {
  view: LetterView;
  now: number;
  ownerName?: string;
  phase: CheckInPhase;
  error?: string | null;
  onTap: () => void;
  extra?: ReactNode;
  /** one plain line under the ring: how this letter will be delivered */
  statusLine?: ReactNode;
}) {
  const { view, now, phase } = props;
  const c = countdown(view, now);
  const dated = view.releaseAt > 0; // a dated letter: nothing to tap, it opens on its day
  const open = !dated && (view.state === "Sealed" || view.state === "Warning");
  const urgent = view.state === "Warning" && phase !== "done";
  const text = ringText(view, c);
  const days = /^(\d+) days?$/.exec(text.big);
  const title = dated && view.state !== "Cancelled" && view.state !== "Opened" ? "Nothing to do." : 
    view.state === "Cancelled" ? "This letter was cancelled." : view.state === "Opened" ? "Your letter has opened." : phase === "done" ? `Thanks${props.ownerName ? `, ${props.ownerName}` : ""}.` : urgent ? "Your letter will open soon." : "Still here?";
  const lead = dated && view.state !== "Cancelled" && view.state !== "Opened" ? `It opens on ${longDay(view.releaseAt)}, whether or not you check in. You can cancel it until then.` :
    view.state === "Cancelled" ? "It was withdrawn, and nobody will ever be able to open it." : view.state === "Opened" ? "The time ran out, so it was opened for the people you chose." : phase === "done" ? "Your letter stays sealed." : urgent ? "You haven't checked in for a while. One tap, and the time starts again." : "One tap tells everyone you're okay.";
  return (
    <div className={`checkin ${urgent ? "urgent" : ""}`}>
      <Headline text={title} />
      <m.p className="lead center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.4 }} aria-live="polite">
        {lead}
      </m.p>
      <div className="ring-wrap">
        <Ring fraction={view.state === "Cancelled" || view.state === "Opened" ? 0 : c.fraction} tone={urgent ? "alert" : open ? "ink" : "faint"} size={236} label={`${text.big} ${text.small}`}>
          {days ? (
            <>
              <span className="ring-big flip">
                <FlipDays value={days[1]!} />
              </span>
              <span className="ring-small">{days[2] === "1" || days[1] === "1" ? "day" : "days"} {text.small}</span>
            </>
          ) : (
            <>
              <span className="ring-big">{text.big}</span>
              <span className="ring-small">{text.small}</span>
            </>
          )}
        </Ring>
      </div>
      {props.statusLine && <p className="delivery-line">{props.statusLine}</p>}
      {open && (
        <div className="checkin-action">
          <m.button type="button" className={`btn primary big-tap ${urgent ? "alert" : ""}`} onClick={props.onTap} disabled={phase === "working"} whileTap={{ scale: 0.97 }}>
            {phase === "working" ? "Confirming with your card…" : "I'm still here"}
          </m.button>
          {props.error && (
            <p className="notice" role="alert">
              {props.error}
            </p>
          )}
        </div>
      )}
      {props.extra}
    </div>
  );
}
