import type { CSSProperties, ReactNode } from "react";

/**
 * The little illustrated scenes that play before each demo screen: stick figures drawn in thin pearl lines on ink,
 * with the wax-red as the one accent. Every moving part is animated by CSS (transform and opacity only) through a few
 * shared animations; the plain, un-animated drawing is the finished picture, so the still version shows it as it is.
 *
 * Rule for the drawings: an animated element never carries its own transform attribute (the CSS animation would
 * replace it): put the position on a parent <g> and the animation on a child <g>.
 */
export type StoryId = "desk" | "family" | "thumbs" | "calendar" | "seal" | "beach" | "race" | "gift";

type Anim = { a?: string; d?: number; dur?: number; origin?: string; vars?: Record<string, string | number> };
const FOREVER = new Set(["bob", "wave", "glow", "ray", "spin", "spin-slow", "drift-x", "twinkle", "scrap"]);
const LINEAR = new Set(["spin", "spin-slow", "scrap", "drift-x"]);
const an = ({ a, d = 0, dur, origin, vars }: Anim): CSSProperties =>
  ({
    animationName: a,
    ...(a && FOREVER.has(a) ? { animationIterationCount: "infinite" } : {}),
    ...(a && LINEAR.has(a) ? { animationTimingFunction: "linear" } : a && FOREVER.has(a) ? { animationTimingFunction: "ease-in-out" } : {}),
    animationDelay: `${d}s`,
    ...(dur ? { animationDuration: `${dur}s` } : {}),
    ...(origin ? { transformOrigin: origin } : {}),
    ...(vars ?? {}),
  }) as CSSProperties;

/** A group that plays one of the shared animations. */
function A({ a, d, dur, origin, vars, className = "", children }: Anim & { className?: string; children?: ReactNode }) {
  return (
    <g className={`an ${className}`} style={an({ a, d, dur, origin, vars })}>
      {children}
    </g>
  );
}

type Hair = "alex" | "mia" | "leo" | "sofia";
function Head({ hair }: { hair: Hair }) {
  return (
    <g>
      <circle className="sk" cx="0" cy="-15" r="10" />
      {hair === "alex" && <path className="sk" d="M-9 -19 Q-2 -29 9 -20" />}
      {hair === "mia" && <path className="sk" d="M-10 -17 Q-17 2 -9 12 M10 -17 Q17 2 9 12" />}
      {hair === "leo" && <path className="sk" d="M-7 -24 L-4 -29 M0 -25 L1 -31 M6 -24 L9 -29" />}
      {hair === "sofia" && <><circle className="sk" cx="0" cy="-30" r="4.5" /><path className="sk" d="M-9 -19 Q0 -27 9 -19" /></>}
    </g>
  );
}

/** A standing figure, neck at (0,0): arms and legs can be replaced for other poses. */
function Person({ name, hair, x, y, s = 1, arms, legs, label = true }: { name: string; hair: Hair; x: number; y: number; s?: number; arms?: ReactNode; legs?: ReactNode; label?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Head hair={hair} />
      <path className="sk" d="M0 -5 L0 36" />
      {arms ?? <path className="sk" d="M0 5 L-17 26 M0 5 L17 26" />}
      {legs ?? <path className="sk" d="M0 36 L-11 72 M0 36 L11 72" />}
      {label && (
        <text className="nm" x="0" y="94" textAnchor="middle">
          {name}
        </text>
      )}
    </g>
  );
}

const Ground = ({ y = 360 }: { y?: number }) => <path className="sk soft" d={`M20 ${y} H340`} />;
const Heart = ({ x, y, d, s = 1 }: { x: number; y: number; d: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <A a="float-up" d={d} dur={2.2}>
      <path className="wxl" d="M0 4 C-10 -4 -7 -12 0 -7 C7 -12 10 -4 0 4 Z" />
    </A>
  </g>
);
const Envelope = ({ w = 34, h = 24, wax = true }: { w?: number; h?: number; wax?: boolean }) => (
  <g>
    <rect className="sk" x={-w / 2} y={-h / 2} width={w} height={h} rx="2" />
    <path className="sk" d={`M${-w / 2} ${-h / 2} L0 ${h * 0.12} L${w / 2} ${-h / 2}`} />
    {wax && <circle className="wx" cx="0" cy={h * 0.12} r="3.6" />}
  </g>
);
const Paper = ({ w = 40, h = 52 }: { w?: number; h?: number }) => (
  <g>
    <rect className="sk paper-fill" x={-w / 2} y={-h / 2} width={w} height={h} rx="2" />
    {[-14, -6, 2, 10].map((y, i) => (
      <path key={i} className="sk soft" d={`M${-w / 2 + 7} ${y} H${w / 2 - 7 - (i === 3 ? 12 : 0)}`} />
    ))}
  </g>
);
const Scraps = () => (
  <>
    {[
      [60, 330, 0, 1],
      [300, 300, 1.2, -1],
      [250, 360, 2.1, 1],
    ].map(([x, y, d, dir], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <A a="scrap" d={d as number} dur={7 + i} vars={{ "--dir": dir as number }} className="scrap-a">
          <rect className="sk faint" x="-7" y="-9" width="14" height="18" rx="1.5" />
        </A>
      </g>
    ))}
  </>
);

/* ------------------------------------------------------------------ the scenes */

function Desk() {
  return (
    <>
      <Ground />
      <Scraps />
      {/* the lamp's light */}
      <A a="glow" d={0.2} dur={3.2} className="lampglow" origin="268px 200px">
        <circle className="lamp-light" cx="268" cy="200" r="86" />
      </A>
      {/* desk and chair */}
      <path className="sk" d="M150 262 H330 M168 262 V358 M312 262 V358" />
      <path className="sk" d="M92 250 V320 M92 322 H124 M92 322 V358 M124 322 V358 M92 322" />
      <path className="sk" d="M92 322 H130" />
      {/* the lamp */}
      <path className="sk" d="M268 262 V236 L250 206 M244 202 L262 212" />
      <path className="sk" d="M262 262 H282" />
      {/* Alex, seated, thinking */}
      <g transform="translate(118 196)">
        <A a="bob" dur={4.2} origin="0px 40px">
          <Head hair="alex" />
          <path className="sk" d="M0 -5 L0 48" />
          <path className="sk" d="M0 48 L28 52 L30 96 M0 48 L22 56 L24 100" />
          <path className="sk" d="M0 8 L26 34 L58 52" />
        </A>
        <text className="nm" x="-62" y="132" textAnchor="middle">Alex</text>
      </g>
      {/* the sheet on the desk, and a pen */}
      <path className="sk soft" d="M176 258 L214 258" />
      <g transform="translate(196 246) rotate(-6)">
        <A a="fly-away" d={2.05} dur={0.95} vars={{ "--dx": "-70px", "--dy": "-150px", "--r": "-14deg", "--s": 3.6 }} className="paper-a">
          <Paper w={36} h={46} />
        </A>
      </g>
      {/* the thought: family */}
      <circle className="sk faint" cx="150" cy="168" r="3" />
      <circle className="sk faint" cx="162" cy="146" r="5" />
      <A a="pop" d={0.35} origin="236px 96px">
        <ellipse className="sk" cx="236" cy="96" rx="82" ry="50" />
        <A a="rise" d={0.9}>
          <Person name="" hair="mia" x={206} y={96} s={0.55} label={false} />
        </A>
        <A a="rise" d={1.35}>
          <Person name="" hair="leo" x={266} y={96} s={0.55} label={false} />
        </A>
      </A>
      <Heart x={236} y={72} d={1.8} s={1.3} />
    </>
  );
}

function Family() {
  return (
    <>
      <Ground />
      <Scraps />
      <path className="sk soft" d="M60 362 Q90 368 120 362 M160 362 Q190 368 220 362 M250 362 Q280 368 310 362" />
      <Person name="Alex" hair="alex" x={74} y={270} s={1.05} arms={<path className="sk" d="M0 5 L-17 26 M0 5 L24 12 L40 8" />} />
      <A a="rise" d={0.55}>
        <Person name="Mia" hair="mia" x={186} y={270} s={1.05} />
      </A>
      <A a="rise" d={1.35}>
        <Person name="Leo" hair="leo" x={286} y={270} s={0.92} />
      </A>
      {/* the pop of each arrival */}
      <A a="ring" d={0.55} dur={0.9} origin="186px 306px"><circle className="sk faint" cx="186" cy="306" r="30" /></A>
      <A a="ring" d={1.35} dur={0.9} origin="286px 306px"><circle className="sk faint" cx="286" cy="306" r="26" /></A>
      {/* an envelope floats from Alex to Mia, then to Leo */}
      <g transform="translate(120 250)">
        <A a="hop" d={1.0} dur={1.6} vars={{ "--dx": "70px", "--dy": "-34px", "--r": "8deg" }}>
          <Envelope />
        </A>
      </g>
      <Heart x={186} y={196} d={1.9} />
      <Heart x={286} y={204} d={2.3} s={0.8} />
    </>
  );
}

function Thumbs() {
  return (
    <>
      <Ground />
      <Scraps />
      {/* a quiet shield over Sofia, with a check */}
      <A a="pop" d={0.9} origin="180px 120px">
        <path className="sk" d="M180 78 L214 90 V118 Q214 144 180 160 Q146 144 146 118 V90 Z" />
        <path className="wxl" d="M165 118 L176 130 L196 104" />
      </A>
      <A a="ring" d={1.5} dur={1.3} origin="180px 120px"><circle className="sk faint" cx="180" cy="120" r="52" /></A>
      <Person
        name="Sofia"
        hair="sofia"
        x={180}
        y={218}
        s={1.5}
        arms={
          <>
            <path className="sk" d="M0 5 L-17 26" />
            <A a="raise" d={0.45} dur={0.9} origin="0px 5px">
              <path className="sk" d="M0 5 L22 -2 L30 -22" />
              <circle className="sk" cx="30" cy="-26" r="4" />
              <path className="sk" d="M30 -30 L30 -39" />
            </A>
          </>
        }
      />
      <g transform="translate(70 300)">
        <Person name="Alex" hair="alex" x={0} y={0} s={0.8} label={false} />
      </g>
    </>
  );
}

function Calendar() {
  const pages = [1, 2, 3, 4, 5, 6];
  return (
    <>
      <Ground />
      <Scraps />
      <rect className="sk" x="82" y="92" width="196" height="214" rx="8" />
      <path className="sk" d="M82 132 H278" />
      <path className="sk" d="M122 80 V104 M180 80 V104 M238 80 V104" />
      {[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4, 5].map((c) => <rect key={`${r}${c}`} className="sk faint" x={96 + c * 28} y={226 + r * 0 + (r > 0 ? 100 : 0)} width="0" height="0" />))}
      {/* the pages, flipping one after another */}
      {pages.map((p, i) => (
        <g key={p} transform="translate(180 132)">
          <A a={i === pages.length - 1 ? undefined : "flip-page"} d={0.35 + i * 0.4} dur={0.5} origin="0px 0px">
            <rect className="sk page" x="-98" y="0" width="196" height="174" />
            <text className="big" x="0" y="112" textAnchor="middle">{p}</text>
            <text className="cap" x="0" y="146" textAnchor="middle">{p === 1 ? "month" : "months"}</text>
          </A>
        </g>
      ))}
      <A a="pop" d={2.55} origin="180px 218px"><circle className="wxr" cx="180" cy="228" r="58" /></A>
      <g transform="translate(40 280)">
        <Person name="" hair="alex" x={0} y={0} s={0.75} label={false} arms={<path className="sk" d="M0 5 L-14 24 M0 5 L22 6 L38 -2" />} />
      </g>
    </>
  );
}

function SealScene() {
  return (
    <>
      <Ground />
      <Scraps />
      <Person name="Alex" hair="alex" x={62} y={252} s={1.05} arms={<path className="sk" d="M0 5 L-17 26 M0 5 L24 18 L52 26" />} />
      {/* the envelope on a little table */}
      <path className="sk" d="M110 322 H330 M130 322 V362 M310 322 V362" />
      <g transform="translate(220 292)">
        <rect className="sk" x="-62" y="-36" width="124" height="72" rx="3" />
        <path className="sk soft" d="M-62 36 L-20 4 M62 36 L20 4" />
        {/* the letter folds and slides in */}
        <g transform="translate(0 -6)">
          <A a="slide-in" d={0.35} dur={1.0} vars={{ "--dy": "-110px" }} className="sheet-a">
            <A a="fold" d={0.35} dur={0.6} origin="0px 0px"><Paper w={64} h={80} /></A>
          </A>
        </g>
        {/* the flap closes */}
        <g transform="translate(0 -36)">
          <A a="flap" d={1.15} dur={0.7} origin="0px 0px"><path className="sk page" d="M-62 0 L0 44 L62 0 Z" /></A>
        </g>
        {/* the wax drop falls and stamps */}
        <g transform="translate(0 8)">
          <A a="drop" d={1.55} dur={0.45} vars={{ "--dy": "-150px" }} className="dropa"><path className="wx" d="M0 -12 C7 -2 7 4 0 6 C-7 4 -7 -2 0 -12 Z" /></A>
          <A a="stamp" d={1.95} dur={0.5} origin="0px 8px">
            <circle className="wx" cx="0" cy="8" r="17" />
            <circle className="stampring" cx="0" cy="8" r="11" />
            <text className="stampT" x="0" y="13" textAnchor="middle">T</text>
          </A>
          <A a="ring" d={2.0} dur={1.0} origin="0px 8px"><circle className="sk wxl" cx="0" cy="8" r="24" /></A>
        </g>
      </g>
    </>
  );
}

function Beach() {
  return (
    <>
      {/* the sun and the sea */}
      <A a="spin-slow" dur={30} origin="290px 92px">
        <circle className="sk" cx="290" cy="92" r="22" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <path key={i} className="sk soft" d={`M${290 + Math.cos(a) * 30} ${92 + Math.sin(a) * 30} L${290 + Math.cos(a) * 40} ${92 + Math.sin(a) * 40}`} />;
        })}
      </A>
      <path className="sk soft" d="M20 232 H340" />
      <A a="drift-x" dur={5}><path className="sk soft" d="M30 252 q12 -8 24 0 t24 0 t24 0 t24 0 t24 0 t24 0" /></A>
      <A a="drift-x" d={1.2} dur={6}><path className="sk faint" d="M150 272 q12 -8 24 0 t24 0 t24 0 t24 0 t24 0" /></A>
      <Ground y={344} />
      {/* an umbrella and a deck chair */}
      <path className="sk" d="M96 140 V344" />
      <path className="sk" d="M46 164 Q96 102 146 164 Z" />
      <path className="wxl" d="M70 140 Q96 112 122 140" />
      <path className="sk" d="M128 330 L184 330 L216 300 M156 330 L176 344 M196 344 L184 330" />
      {/* Alex, in the chair, waving */}
      <g transform="translate(160 262)">
        <Head hair="alex" />
        <path className="sk" d="M0 -5 L0 46 L34 52 L40 86" />
        <path className="sk" d="M0 5 L-16 30" />
        <A a="wave" dur={1.1} origin="0px 5px">
          <path className="sk" d="M0 5 L20 -10 L30 -34" />
          <path className="sk" d="M30 -34 L25 -43 M30 -34 L31 -45 M30 -34 L37 -42" />
        </A>
        <text className="nm" x="14" y="116" textAnchor="middle">Alex</text>
      </g>
      {/* "I'm still here" */}
      <A a="pop" d={0.5} origin="150px 168px">
        <rect className="sk" x="44" y="170" width="152" height="40" rx="14" />
        <path className="sk" d="M150 210 L160 226 L168 210" />
        <text className="say" x="120" y="196" textAnchor="middle">I'm still here</text>
      </A>
      {/* Sofia pauses it */}
      <Person name="Sofia" hair="sofia" x={290} y={252} s={1} arms={<><path className="sk" d="M0 5 L-17 26" /><path className="sk" d="M0 5 L-24 -8 L-34 -30" /></>} />
      <A a="pop" d={1.5} origin="252px 160px">
        <circle className="sk" cx="252" cy="160" r="26" />
        <path className="wxl pause" d="M244 148 V172 M260 148 V172" />
      </A>
      <A a="ring" d={1.6} dur={1.2} origin="252px 160px"><circle className="sk faint" cx="252" cy="160" r="30" /></A>
    </>
  );
}

function Race() {
  return (
    <>
      <A a="twinkle" d={0} dur={2.4}>{[[40, 70], [320, 60], [70, 300], [300, 320], [180, 30]].map(([x, y], i) => <path key={i} className="sk soft" d={`M${x} ${y - 5} V${y + 5} M${x - 5} ${y} H${x + 5}`} />)}</A>
      <path className="sk soft" d="M20 372 H340" />
      {/* the clock, spinning */}
      <circle className="sk" cx="180" cy="190" r="74" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <path key={i} className="sk soft" d={`M${180 + Math.cos(a) * 64} ${190 + Math.sin(a) * 64} L${180 + Math.cos(a) * 70} ${190 + Math.sin(a) * 70}`} />;
      })}
      <A a="spin" dur={0.9} origin="180px 190px"><path className="sk" d="M180 190 V138" /></A>
      <A a="spin" dur={9} origin="180px 190px"><path className="sk" d="M180 190 V160" /></A>
      <circle className="wx" cx="180" cy="190" r="4" />
      {/* the sun chases the moon round and round */}
      <A a="spin" dur={2.4} origin="180px 190px" className="orbit">
        <g transform="translate(180 62)">
          <circle className="sk" r="14" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <path key={i} className="sk soft" d={`M${Math.cos(a) * 19} ${Math.sin(a) * 19} L${Math.cos(a) * 26} ${Math.sin(a) * 26}`} />;
          })}
        </g>
        <g transform="translate(180 318)">
          <path className="sk" d="M8 -14 A14 14 0 1 0 8 14 A11 11 0 1 1 8 -14 Z" />
        </g>
      </A>
      {/* calendar pages blowing past */}
      {[[40, 150, 0], [310, 210, 0.9], [60, 250, 1.7]].map(([x, y, d], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <A a="scrap" d={d as number} dur={3.4} vars={{ "--dir": i % 2 ? -1 : 1 }} className="scrap-a"><rect className="sk faint" x="-9" y="-11" width="18" height="22" rx="1.5" /></A>
        </g>
      ))}
    </>
  );
}

function Gift() {
  return (
    <>
      <Ground />
      <Scraps />
      {/* the glow and the light */}
      <A a="glow" dur={2.4} className="giftglow" origin="180px 220px"><circle className="gift-light" cx="180" cy="220" r="120" /></A>
      {Array.from({ length: 9 }, (_, i) => {
        const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
        return (
          <g key={i} transform={`translate(180 214) rotate(${(a * 180) / Math.PI + 90})`}>
            <A a="ray" d={0.6 + i * 0.07} dur={2.2} origin="0px 0px"><path className="sk soft" d="M0 -46 V-92" /></A>
          </g>
        );
      })}
      <Person name="Mia" hair="mia" x={180} y={262} s={1.2} arms={<><path className="sk" d="M0 5 L-18 24 L-6 38" /><path className="sk" d="M0 5 L18 24 L6 38" /></>} />
      <Person name="Leo" hair="leo" x={290} y={282} s={0.9} />
      {/* the envelope drifts down into Mia's hands */}
      <g transform="translate(180 230)">
        <A a="descend" dur={2.2} vars={{ "--dy": "-210px" }}>
          <Envelope w={42} h={30} />
          <circle className="wx" cx="0" cy="3.6" r="4.4" />
        </A>
      </g>
      <A a="glint" d={1.8} dur={1.4} origin="180px 212px"><path className="wxl" d="M180 196 V228 M164 212 H196" /></A>
    </>
  );
}

const SCENES: Record<StoryId, () => JSX.Element> = { desk: Desk, family: Family, thumbs: Thumbs, calendar: Calendar, seal: SealScene, beach: Beach, race: Race, gift: Gift };

/** One illustrated scene, on its own transparent canvas (the intro puts it on the ink). */
export function Story({ id, still = false }: { id: StoryId; still?: boolean }) {
  const Scene = SCENES[id];
  return (
    <svg className={`story ${still ? "still" : ""}`} viewBox="0 0 360 420" role="img" aria-label={STORY_ALT[id]} preserveAspectRatio="xMidYMid meet">
      <Scene />
    </svg>
  );
}

export const STORY_ALT: Record<StoryId, string> = {
  desk: "Alex at a desk, thinking of Mia and Leo",
  family: "Mia and Leo appear beside Alex, one by one",
  thumbs: "Sofia gives a thumbs up",
  calendar: "A calendar's pages flip, month by month",
  seal: "Alex folds the letter into an envelope and a drop of wax seals it",
  beach: "Alex waves from a beach, I'm still here, and Sofia pauses the clock",
  race: "Years pass: a clock spins while the sun and the moon race around it",
  gift: "Mia receives a glowing envelope",
};
