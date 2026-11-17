import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import type { ReactNode } from "react";
import { Background } from "../ui/Background";
import { SoundWave } from "../ui/SoundWave";
import { ThemeToggle } from "../ui/ThemeToggle";

/** The frame around My letters, the guardian page and the cards: the same pearl, ink and glass as the rest. */
export function Shell({ children, here, className = "" }: { children: ReactNode; here: "me" | "guardian" | "cards" | "join" | "open"; className?: string }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className={`root ${className}`}>
          <Background />
          <div className="app me-app">
            <header className="brand">
              <div className="brand-text">
                <a className="brand-name" href="/" aria-label="Tabella, home">
                  Tabella
                </a>
                {here !== "join" && here !== "open" && (
                <nav className="me-nav" aria-label="Pages">
                  <a href="/me" aria-current={here === "me" ? "page" : undefined}>
                    My letters
                  </a>
                  <a href="/guardian" aria-current={here === "guardian" ? "page" : undefined}>
                    Guardian
                  </a>
                  <a href="/write">Write</a>
                </nav>
                )}
              </div>
              <div className="head-tools">
                <ThemeToggle />
                <SoundWave />
              </div>
            </header>
            <main>{children}</main>
            <footer>A demo on a test network. Please don't write real secrets yet.</footer>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
