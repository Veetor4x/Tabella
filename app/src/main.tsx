import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Landing } from "./landing/Landing";
import { CardsPage } from "./me/CardsPage";
import { GuardianPage } from "./me/GuardianPage";
import { MePage } from "./me/MePage";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles.css";
import { initTheme } from "./lib/theme";

initTheme();
const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");
const root = createRoot(container);

// /#spike is the developer test page (QoreX registration and a seal-and-open check). Loaded only when asked for.
window.addEventListener("hashchange", () => window.location.reload());
if (window.location.hash === "#spike") {
  void import("./spike/KemSpike").then(({ KemSpike }) => root.render(<KemSpike />));
} else {
  // "/" is the front page; "/write" is the owner's flow
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const page = path === "/write" ? <App /> : path === "/me" || path.startsWith("/me/") ? <MePage /> : path === "/guardian" ? <GuardianPage /> : path === "/cards" ? <CardsPage /> : <Landing />;
  root.render(<React.StrictMode>{page}</React.StrictMode>);
}
