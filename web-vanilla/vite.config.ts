import { defineConfig } from "vite";

export default defineConfig({
  // EXAMPLE_SERVER_URL from .env reaches the page as import.meta.env.EXAMPLE_SERVER_URL.
  envPrefix: ["VITE_", "EXAMPLE_"],
  server: { port: 5173, strictPort: true },
});
