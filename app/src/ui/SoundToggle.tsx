import { useSyncExternalStore } from "react";
import { isSoundOn, setSound, subscribeSound } from "../lib/sound";
import { IconSound } from "./icons";

/** A thin speaker: switches the one soft tone on or off. Off until you tap it. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => false);
  return (
    <button type="button" className="sound" aria-pressed={on} aria-label={on ? "Sound on" : "Sound off"} onClick={() => setSound(!on)}>
      <IconSound on={on} size={20} />
    </button>
  );
}
