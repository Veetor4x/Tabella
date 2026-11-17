/**
 * An envelope opening in real 3D: the seal lets go, the flap folds back on its hinge (the closed flap turns edge-on, the inside of
 * the flap comes over behind it), and the letter rises out. Only transforms and opacity move. The same picture as the film's last scene.
 */
export function OpenEnvelope({ lines }: { lines: string[] }) {
  return (
    <div className="oe" role="img" aria-label="An envelope opens: the seal lets go, the flap folds open and the letter rises out">
      <div className="oe-stage" aria-hidden="true">
        <div className="oe-back" />
        <div className="oe-flap-in" />
        <div className="oe-letter">
          {lines.slice(0, 9).map((l, i) => (
            <span key={i} className={i === 0 ? "oe-hello" : ""}>
              {l || " "}
            </span>
          ))}
        </div>
        <div className="oe-front" />
        <div className="oe-flap-out" />
        <div className="oe-seal" />
      </div>
    </div>
  );
}
