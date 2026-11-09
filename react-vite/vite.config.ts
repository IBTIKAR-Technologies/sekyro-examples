import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // EXAMPLE_SERVER_URL from .env reaches the page as import.meta.env.EXAMPLE_SERVER_URL.
  envPrefix: ["VITE_", "EXAMPLE_"],
  server: { port: 5174, strictPort: true },
});
