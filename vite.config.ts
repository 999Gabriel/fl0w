import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages project path (https://<user>.github.io/flow/)
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/flow/" : "/",
  plugins: [react()],
  server: { port: 5173 },
}));
