import { useEffect, useRef, useState } from "react";

function Digit({ d }: { d: string }) {
  const prev = useRef(d);
  const [old, setOld] = useState<string | null>(null);
  useEffect(() => {
    if (prev.current === d) return;
    setOld(prev.current);
    prev.current = d;
    const t = setTimeout(() => setOld(null), 800);
    return () => clearTimeout(t);
  }, [d]);
  return (
    <span className="fd">
      <span className="fd-half fd-top">
        <b>{d}</b>
      </span>
      <span className="fd-half fd-bot">
        <b>{old ?? d}</b>
      </span>
      {old !== null && (
        <>
          <span className="fd-half fd-top fd-flap-top">
            <b>{old}</b>
          </span>
          <span className="fd-half fd-bot fd-flap-bot">
            <b>{d}</b>
          </span>
        </>
      )}
    </span>
  );
}

/** Days left, as flip-clock digits: when a digit changes, its top half folds down and the new one folds in (transform only). */
export function FlipDays({ value }: { value: string }) {
  return (
    <span className="flipdays" aria-hidden="true">
      {value.split("").map((c, i, a) => (
        <Digit key={a.length - i} d={c} />
      ))}
    </span>
  );
}
