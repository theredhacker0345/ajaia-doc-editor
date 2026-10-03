import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // mammoth ships a prebuilt browser bundle; use it instead of the Node build.
    alias: { mammoth: "mammoth/mammoth.browser.js" },
  },
  server: {
    port: 5173,
    proxy: {
      // In `npm run dev`, the Vite dev server forwards API calls to `wrangler dev`.
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1600,
  },
});
