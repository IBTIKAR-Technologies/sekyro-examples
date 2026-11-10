import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue({
      // <sekyro-verification> is a custom element: Vue leaves it (and every sekyro- tag) to the browser.
      template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("sekyro-") } },
    }),
  ],
  // EXAMPLE_SERVER_URL from .env reaches the page as import.meta.env.EXAMPLE_SERVER_URL.
  envPrefix: ["VITE_", "EXAMPLE_"],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
});
