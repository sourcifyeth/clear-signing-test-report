import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages under the repository name.
export default defineConfig({
  base: "/clear-signing-test-report/",
  plugins: [react()],
  server: { port: 5275 },
});
