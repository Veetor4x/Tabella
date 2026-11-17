import { m } from "framer-motion";
import { useEffect, useState } from "react";
import { OPENED_EVENT, takeOpened } from "../lib/openedSignal";
import { EASE } from "../ui/motion";
import { WaxSeal } from "../ui/WaxSeal";

/**
 * A small sealed envelope bobbing on the nearest cloud in the hero. When a letter is opened anywhere on the site, it lifts off
 * the cloud and floats away; a while later another one settles back. Movement and fading only.
 */
export function Perch() {
  const [gone, setGone] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const away = () => setGone(true);
    window.addEventListener(OPENED_EVENT, away);
    // opened on another page since the last visit here: show it resting for a moment, then it goes
    let t: ReturnType<typeof setTimeout> | undefined;
    if (takeOpened()) t = setTimeout(away, 1800);
    return () => {
      window.removeEventListener(OPENED_EVENT, away);
      clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => {
      setGone(false);
      setRound((r) => r + 1);
    }, 11_000);
    return () => clearTimeout(t);
  }, [gone]);

  return (
    <div className="perch" role="img" aria-label="A sealed letter resting on a soft cloud">
      <div className="perch-cloud">
        <i className="pc-shade" />
        <i className="pc-lit" />
      </div>
      <m.div
        key={round}
        className="perch-lift"
        initial={round === 0 ? false : { opacity: 0, y: 16 }}
        animate={gone ? { y: [0, -14, -170, -300], x: [0, 4, 26, 60], rotate: [0, -2, 5, 9], opacity: [1, 1, 0.9, 0] } : { y: 0, x: 0, rotate: 0, opacity: 1 }}
        transition={gone ? { duration: 7, times: [0, 0.12, 0.6, 1], ease: EASE } : { duration: 1.4, ease: EASE }}
      >
        <div className="perch-env">
          <div className="pe-body" />
          <div className="pe-flap" />
          <WaxSeal className="pe-seal" />
        </div>
      </m.div>
    </div>
  );
}
