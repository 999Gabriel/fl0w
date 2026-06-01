import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages project path (https://<user>.github.io/fl0w/)
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/fl0w/" : "/",
  plugins: [react()],
  server: { port: 5173 },
}));
