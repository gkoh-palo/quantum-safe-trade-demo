import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `vite dev`, proxy the API (auth + trades) to the deployed sentry worker so
// the booking SPA works locally. In production the sentry worker serves both the
// assets and the API.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    proxy: {
      "/api": { target: "https://qstd-sentry.gkoh.workers.dev", changeOrigin: true },
      "/trades": { target: "https://qstd-sentry.gkoh.workers.dev", changeOrigin: true },
    },
  },
});
