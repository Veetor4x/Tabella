import { m } from "framer-motion";
import { useSyncExternalStore } from "react";
import { isSoundOn, setSound, subscribeSound } from "../lib/sound";
import { iconTap } from "./motion";

/** 🔈: switches the soft seal thud on or off. Off until you tap it. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => false);
  return (
    <m.button
      type="button"
      className={`sound ${on ? "on" : "off"}`}
      aria-pressed={on}
      aria-label={on ? "Sound on" : "Sound off"}
      whileTap={iconTap}
      onClick={() => setSound(!on)}
    >
      <span aria-hidden="true">{on ? "🔊" : "🔈"}</span>
      {!on && <span className="slash" aria-hidden="true" />}
    </m.button>
  );
}
