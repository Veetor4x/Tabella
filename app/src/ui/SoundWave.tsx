import { useSyncExternalStore } from "react";
import { siteMusicAvailable, siteMusicPlaying, subscribeSiteMusic, toggleSiteMusic } from "../lib/siteMusic";

/** A small glass pill with four thin bars that move while the music plays and go still when it is paused. */
export function SoundWave() {
  const on = useSyncExternalStore(subscribeSiteMusic, siteMusicPlaying, () => false);
  if (!siteMusicAvailable()) return null;
  return (
    <button type="button" className={`sound-wave glass ${on ? "playing" : ""}`} aria-pressed={on} aria-label={on ? "Pause the music" : "Play the music"} onClick={toggleSiteMusic}>
      <span className="sw-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
