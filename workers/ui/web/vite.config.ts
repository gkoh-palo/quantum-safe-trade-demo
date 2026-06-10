import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `vite dev`, proxy /api to the deployed ui worker so the SPA works locally
// without running the whole stack. In production the ui worker serves both.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    proxy: {
      "/api": {
        target: "https://qstd-ui.gkoh.workers.dev",
        changeOrigin: true,
      },
    },
  },
});
