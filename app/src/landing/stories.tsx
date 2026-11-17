import type { CSSProperties, ReactNode } from "react";

/**
 * The quiet scenes that play before each demo screen: single objects drawn in thin pearl lines on ink, lots of space,
 * and at most one wax-red accent. Every moving part is a CSS animation (transform and opacity only) from a small set.
 * The plain drawing is the finished picture, so the still version simply shows it.
 *
 * Rule for the drawings: an animated element never carries its own transform attribute (the CSS animation would
 * replace it): put the position on a parent <g> and the animation on a child <g>.
 */
export type StoryId = "desk" | "chairs" | "shield" | "calendar" | "seal" | "horizon" | "clock" | "open" | "reach" | "backup" | "find" | "openq";

type Anim = { a?: string; d?: number; dur?: number; origin?: string; ease?: string; fill?: "both" | "backwards" };
const an = ({ a, d = 0, dur, origin, ease, fill }: Anim): CSSProperties =>
  ({
    animationName: a,
    animationDelay: `${d}s`,
    ...(dur ? { animationDuration: `${dur}s` } : {}),
    ...(origin ? { transformOrigin: origin } : {}),
    ...(ease ? { animationTimingFunction: ease } : {}),
    ...(fill ? { animationFillMode: fill } : {}),
  }) as CSSProperties;

function A({ children, className = "", ...o }: Anim & { children?: ReactNode; className?: string }) {
  return (
    <g className={`an ${className}`} style={an(o)}>
      {children}
    </g>
  );
}

/* ------------------------------------------------------------------ the scenes */

/** A pen and a sheet of paper: the pen writes the lines. */
function Desk() {
  const lines = [150, 178, 206, 234];
  return (
    <>
      <rect className="sk" x="108" y="104" width="144" height="196" rx="3" />
      {lines.map((y, i) => (
        <g key={y} transform={`translate(128 ${y})`}>
          <A a="wipe" d={0.5 + i * 0.62} dur={0.55} origin="0px 0px" ease="linear">
            <path className="sk soft" d={`M0 0 H${i === 3 ? 60 : 104}`} />
          </A>
        </g>
      ))}
      {/* the pen, moving with the writing */}
      <g transform="translate(232 150)">
        <A a="pen" d={0.2} dur={3.4} ease="ease-in-out" fill="both">
          <path className="sk" d="M0 0 L46 -92 M5 -2 L51 -94 M0 0 L5 -2" />
          <path className="wxl" d="M0 0 L-2 5" />
        </A>
      </g>
    </>
  );
}

/** Two chairs, one after the other, side by side. */
function Chairs() {
  const chair = (x: number, name: string, d: number) => (
    <g transform={`translate(${x} 320)`}>
      <A a="rise" d={d} dur={0.9}>
        <path className="sk" d="M0 0 V-62 H66 V0 M0 -62 V-128 M0 -128 H10" />
        <text className="nm" x="33" y="40" textAnchor="middle">{name}</text>
      </A>
    </g>
  );
  return (
    <>
      <path className="sk faint" d="M60 322 H300" />
      {chair(80, "Mia", 0.5)}
      {chair(210, "Leo", 1.5)}
    </>
  );
}

/** A shield with a check: someone who watches over it. */
function Shield() {
  return (
    <>
      <A a="pop" d={0.3} dur={0.9} origin="180px 200px">
        <path className="sk" d="M180 120 L240 142 V196 Q240 240 180 270 Q120 240 120 196 V142 Z" />
      </A>
      <A a="rise" d={1.2} dur={0.8}>
        <path className="wxl" d="M152 196 L174 218 L212 170" />
      </A>
      <text className="nm" x="180" y="318" textAnchor="middle">Sofia</text>
    </>
  );
}

/** A calendar whose pages turn, month after month. */
function Calendar() {
  const pages = [1, 2, 3, 4, 5, 6];
  return (
    <>
      <rect className="sk" x="104" y="110" width="152" height="176" rx="6" />
      <path className="sk" d="M104 150 H256 M146 100 V122 M214 100 V122" />
      {pages.map((p, i) => (
        <g key={p} transform="translate(180 150)">
          {i === pages.length - 1 ? (
            <>
              <rect className="cover" x="-75" y="2" width="150" height="132" />
              <text className="big" x="0" y="92" textAnchor="middle">{p}</text>
              <text className="cap" x="0" y="122" textAnchor="middle">months</text>
              <A a="pop" d={2.9} dur={0.7} origin="0px 66px">
                <circle className="wxl" cx="0" cy="66" r="46" />
              </A>
            </>
          ) : (
            <A a="flip-page" d={0.35 + i * 0.5} dur={0.45} origin="0px 0px" fill="both">
              <rect className="cover" x="-75" y="2" width="150" height="132" />
              <text className="big" x="0" y="92" textAnchor="middle">{p}</text>
              <text className="cap" x="0" y="122" textAnchor="middle">{p === 1 ? "month" : "months"}</text>
            </A>
          )}
        </g>
      ))}
    </>
  );
}

/** An envelope: the letter slides in, the flap closes, the seal is pressed. */
function SealScene() {
  return (
    <g transform="translate(180 230)">
      {/* the letter sliding down into the envelope (it ends hidden behind the front) */}
      <A a="letter-in" d={0.3} dur={1.1} ease="ease-in-out" fill="backwards">
        <rect className="letter-sheet" x="-60" y="-42" width="120" height="94" rx="2" />
        <path className="ln" d="M-42 -24 H42 M-42 -10 H42 M-42 4 H42 M-42 18 H12" />
      </A>
      <rect className="cover" x="-91" y="-49" width="182" height="109" />
      <path className="sk" d="M-90 -50 H90 V60 H-90 Z M-90 60 L-18 6 M90 60 L18 6" />
      {/* the flap closes */}
      <A a="flap-close" d={1.4} dur={0.8} origin="0px -50px" ease="ease-in-out" fill="backwards">
        <path className="sk" d="M-90 -50 L0 20 L90 -50" />
      </A>
      {/* the seal is pressed */}
      <g transform="translate(0 20)">
        <A a="stamp" d={2.2} dur={0.55} origin="0px 0px" fill="backwards">
          <circle className="wx" r="17" />
          <circle className="sk faint" r="11" />
          <text className="stampT" x="0" y="5" textAnchor="middle">T</text>
        </A>
      </g>
    </g>
  );
}

/** A horizon and a low sun: "I'm still here", with one pause mark. */
function Horizon() {
  return (
    <>
      <path className="sk soft" d="M50 262 H310" />
      <A a="sun-up" d={0.2} dur={1.6}>
        <path className="sk" d="M156 262 A24 24 0 0 1 204 262" />
      </A>
      <A a="rise" d={0.9} dur={1}>
        <text className="say" x="180" y="318" textAnchor="middle">I'm still here</text>
      </A>
      <A a="pop" d={1.9} dur={0.7} origin="180px 150px">
        <path className="wxl" d="M170 136 V164 M190 136 V164" />
      </A>
    </>
  );
}

/** A clock whose hands turn and slowly settle; a sun and a moon go round it. */
function Clock() {
  return (
    <>
      <circle className="sk" cx="180" cy="210" r="86" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} className="sk soft" d="M180 130 V142" transform={`rotate(${a} 180 210)`} />
      ))}
      <A a="settle-turn" d={0.1} dur={3.4} origin="180px 210px" ease="cubic-bezier(0.16, 0.7, 0.3, 1)" fill="backwards">
        <path className="sk" d="M180 210 V154" transform="rotate(300 180 210)" />
      </A>
      <A a="settle-turn-slow" d={0.1} dur={3.4} origin="180px 210px" ease="cubic-bezier(0.16, 0.7, 0.3, 1)" fill="backwards">
        <path className="sk" d="M180 210 V170" transform="rotate(60 180 210)" />
      </A>
      <circle className="wx" cx="180" cy="210" r="3.6" />
      {/* the sun and the moon, opposite each other */}
      <A a="orbit" d={0.1} dur={3.4} origin="180px 210px" ease="cubic-bezier(0.16, 0.7, 0.3, 1)" fill="backwards">
        <circle className="sk soft" cx="180" cy="86" r="8" />
        <path className="sk soft" d="M186 326 A9 9 0 1 0 186 344 A7 7 0 1 1 186 326 Z" />
      </A>
    </>
  );
}

/** The words on the sheet in the demo's final scene. */
export const DEMO_SHEET = [
  "Dear Mia and Leo,",
  "",
  "I've put aside 2 Bitcoin for you",
  "both, my gift for your futures.",
  "The hardware wallet is in the small",
  "safe in my study, and its recovery",
  "card is sealed with Mr. Hart, our",
  "lawyer. Show him this letter and",
  "he'll help you. Split it fairly",
  "and look after each other.",
  "",
  "All my love, Alex.",
];

/** Break a real letter into short lines that fit on the sheet (the first part: the full text is shown after). */
export function sheetLines(text: string, width = 34, max = 12): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of para.split(/\s+/)) {
      if ((line + " " + w).trim().length > width && line) {
        out.push(line);
        line = w;
      } else line = (line + " " + w).trim();
    }
    if (line) out.push(line);
  }
  while (out.length && out[0] === "") out.shift();
  const cut = out.length > max;
  const lines = out.slice(0, max);
  if (cut) lines[max - 1] = lines[max - 1]!.replace(/[\s,.;:]*$/, "") + "…";
  return lines;
}

/** The last scene: the seal cracks, the flap lifts, the letter slides out, and the camera comes in until it can be read. */
export function EnvelopeOpen({ lines, dur = 2.6, delay = 4.0, t0 = 0 }: { lines: string[]; dur?: number; delay?: number; t0?: number }) {
  return (
    <A a="zoom-read" d={delay + t0} dur={dur} origin="180px 96px" ease="cubic-bezier(0.45, 0, 0.2, 1)" fill="backwards" className="read">
      {/* the open flap, behind the letter */}
      <A a="flap-open" d={1.3 + t0} dur={0.6} fill="backwards">
        <path className="sk" d="M90 190 L180 128 L270 190" />
      </A>
      {/* the letter, sliding out (nothing of it shows below the envelope while it starts inside) */}
      <clipPath id="tbl-envelope-clip">
        <rect x="0" y="0" width="360" height="311" />
      </clipPath>
      <g clipPath="url(#tbl-envelope-clip)">
      <A a="letter-out" d={1.7 + t0} dur={1.5} ease="cubic-bezier(0.25, 0.6, 0.3, 1)" fill="backwards">
        <rect className="letter-sheet" x="104" y="46" width="152" height="134" rx="2" />
        {lines.map((l, i) =>
          l ? (
            <text key={i} className="hand" x="114" y={61 + i * 9.6} fontSize={i === 0 ? 7.4 : 6.6}>
              {l}
            </text>
          ) : null,
        )}
      </A>
      </g>
      {/* the front of the envelope */}
      <rect className="cover" x="89" y="189" width="182" height="122" />
      <path className="sk" d="M90 190 H270 V310 H90 Z M90 310 L162 254 M270 310 L198 254" />
      {/* the closed flap, which lifts away */}
      <A a="flap-lift" d={0.9 + t0} dur={0.8} origin="180px 190px" ease="ease-in-out" fill="backwards">
        <path className="sk" d="M90 190 L180 262 L270 190" />
      </A>
      {/* the seal, which cracks in two */}
      <g transform="translate(180 262)">
        <A a="seal-halves" d={0.35 + t0} dur={0.6} origin="0px 0px" ease="ease-out" fill="backwards">
          <g className="halfL"><path className="wx" d="M0 -17 A17 17 0 0 0 0 17 L-3 9 L2 2 L-2 -6 Z" /></g>
          <g className="halfR"><path className="wx" d="M0 -17 A17 17 0 0 1 0 17 L-3 9 L2 2 L-2 -6 Z" /></g>
        </A>
      </g>
    </A>
  );
}
const Open = () => <EnvelopeOpen lines={DEMO_SHEET} />;

/** A small envelope: the way we reach someone, for now. Used by the Surprise film. */
const Mail = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect className="sk" x="0" y="0" width="62" height="42" rx="2" />
    <path className="sk soft" d="M0 0 L31 24 L62 0" />
  </g>
);

/** Keep it a surprise: an email address, and a card with a question only they can answer. */
function Reach() {
  return (
    <>
      <g transform="translate(120 130)">
        <A a="rise" d={0.4}>
          <rect className="sk" x="0" y="0" width="120" height="80" rx="3" />
          <path className="sk soft" d="M0 0 L60 46 L120 0" />
        </A>
      </g>
      <g transform="translate(120 270)">
        <A a="pop" d={1.4} origin="60px 28px">
          <rect className="sk" x="0" y="0" width="120" height="58" rx="6" />
          <text className="big" x="60" y="44" textAnchor="middle" style={{ fontSize: 44 }}>?</text>
        </A>
      </g>
    </>
  );
}

/** A second person, in case the first cannot be reached: a second envelope, with an arrow to it. */
function Backup() {
  return (
    <>
      <g transform="translate(46 150)"><Mail x={0} y={0} /></g>
      <g transform="translate(252 150)"><A a="rise" d={0.7}><Mail x={0} y={0} /></A></g>
      <A a="pop" d={1.5} origin="180px 171px"><path className="wxl" d="M128 171 H232 M222 161 L232 171 L222 181" /></A>
    </>
  );
}

/** Tabella finds them: an email, then a reminder, then a second person. */
function Find() {
  return (
    <>
      <g transform="translate(40 160)"><A a="pop" d={0.3} origin="31px 21px"><Mail x={0} y={0} /></A></g>
      <g transform="translate(149 160)"><A a="pop" d={1.2} origin="31px 21px"><Mail x={0} y={0} /></A></g>
      <g transform="translate(258 160)"><A a="pop" d={2.1} origin="31px 21px"><Mail x={0} y={0} /></A></g>
      <g transform="translate(180 250)"><A a="rise" d={2.6}><path className="wxl" d="M-12 0 H12" /></A></g>
    </>
  );
}

/** The question card, then the envelope opens: the Surprise film's last scene. */
function OpenQ() {
  return (
    <>
      <g transform="translate(120 160)">
        <g className="an qcard" style={{ animationName: "qcard", animationDelay: "0s", animationDuration: "2.4s", animationFillMode: "backwards" }}>
          <rect className="sk" x="0" y="0" width="120" height="76" rx="6" />
          <text className="big" x="60" y="56" textAnchor="middle" style={{ fontSize: 56 }}>?</text>
        </g>
      </g>
      <EnvelopeOpen lines={DEMO_SHEET} t0={2.2} />
    </>
  );
}

const SCENES: Record<StoryId, () => JSX.Element> = { desk: Desk, chairs: Chairs, shield: Shield, calendar: Calendar, seal: () => <SealScene />, horizon: Horizon, clock: Clock, open: Open, reach: Reach, backup: Backup, find: Find, openq: OpenQ };

/** One scene, on its own transparent canvas (the intro puts it on the ink). */
export function Story({ id, still = false, lines }: { id: StoryId; still?: boolean; lines?: string[] }) {
  const Scene = id === "open" && lines ? () => <EnvelopeOpen lines={lines} /> : id === "seal" && lines ? () => <SealScene /> : SCENES[id];
  return (
    <svg className={`story ${still ? "still" : ""}`} viewBox="0 0 360 420" role="img" aria-label={STORY_ALT[id]} preserveAspectRatio="xMidYMid meet">
      <Scene />
    </svg>
  );
}

export const STORY_ALT: Record<StoryId, string> = {
  desk: "A pen writes lines on a sheet of paper",
  chairs: "Two chairs, one for Mia and one for Leo",
  shield: "A shield with a check mark, for Sofia",
  calendar: "A calendar whose pages turn up to six months",
  seal: "A letter slides into an envelope, the flap closes and a wax seal is pressed",
  horizon: "A low sun on a horizon, I'm still here",
  clock: "A clock whose hands turn and settle, with a sun and a moon going round it",
  open: "An envelope opens: the seal cracks, the flap lifts and the letter slides out to be read",
  reach: "An envelope, and a card with a question mark: how to reach someone, and a question only they can answer",
  backup: "Two envelopes, and an arrow from the first to the second: a second person, in case the first cannot be reached",
  find: "Three envelopes appear one after the other: the email, a reminder, and a message to someone they trust",
  openq: "A question card, then an envelope opens: the seal cracks, the flap lifts and the letter slides out to be read",
};
