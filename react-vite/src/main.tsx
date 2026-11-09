import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@sekyro/react/styles.css";
import "@sekyro/react/verification.css";
import "./app.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
