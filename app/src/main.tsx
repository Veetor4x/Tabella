import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");
const root = createRoot(container);

// /#spike is the developer test page (QoreX registration and a seal-and-open check). Loaded only when asked for.
window.addEventListener("hashchange", () => window.location.reload());
if (window.location.hash === "#spike") {
  void import("./spike/KemSpike").then(({ KemSpike }) => root.render(<KemSpike />));
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
