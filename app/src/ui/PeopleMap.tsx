import { m } from "framer-motion";
import type { ReactNode } from "react";
import { drawAcross, drawDown, labelIn, nodeIn, pointIn } from "./motion";

interface Props {
  /** The centre: the letter card (day) or the seal (night). */
  root: ReactNode;
  people: string[];
  guardian: string | null;
  variant: "day" | "night";
  /** a slow shimmer sweeps across while the letter is being sealed */
  working?: boolean;
  /** seconds before the first line starts to draw */
  start?: number;
}

const initial = (n: string) => n.trim().charAt(0).toUpperCase() || "•";

/**
 * The letter as a map: the letter in the centre, each person branching out below it on thin lines that draw
 * themselves, the guardian linked at the side. At night the same map becomes glowing points joined by lines.
 */
export function PeopleMap({ root, people, guardian, variant, working = false, start = 0.5 }: Props) {
  const night = variant === "night";
  const n = people.length;
  const node = (name: string, delay: number, guard = false) =>
    night ? (
      <m.div className={`point ${guard ? "guard" : ""}`} {...pointIn(delay)}>
        <span className="dot" />
        {!guard && <span className="who">{name}</span>}
      </m.div>
    ) : (
      <m.div className={`person-node glass ${guard ? "guard" : ""}`} {...nodeIn(delay)}>
        <span className="avatar">{initial(name)}</span>
        {!guard && <span className="who">{name}</span>}
      </m.div>
    );

  return (
    <div className={`map ${night ? "night-map" : ""}`} data-testid="map">
      <div className="map-top">
        <div className={`map-root ${night ? "is-seal" : ""}`}>
          {root}
          {guardian && (
            <div className="map-guard">
              <m.span className="ln-h guard-line" {...drawAcross(start + 0.9)} />
              {node(guardian, start + 1.4, true)}
              <m.span className="guard-label" {...labelIn(start + 1.8)}>
                <b>{guardian}</b>
                <i>guardian</i>
              </m.span>
            </div>
          )}
        </div>
      </div>
      <div className="trunk">
        <m.span className="ln-v" {...drawDown(start)} />
        <m.span className="tag" {...labelIn(start + 0.5)}>
          {night ? "can open" : "can open"}
        </m.span>
      </div>
      <div className="branch">
        {n > 1 && <m.span className="ln-h bar" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} {...drawAcross(start + 0.55)} />}
        <div className="people">
          {people.map((name, i) => (
            <div className="col" key={i}>
              <m.span className="ln-v drop" {...drawDown(start + 0.9 + i * 0.15)} />
              {node(name || `Person ${i + 1}`, start + 1.3 + i * 0.15)}
            </div>
          ))}
        </div>
      </div>
      {working && <span className="map-shimmer" aria-hidden="true" />}
    </div>
  );
}
