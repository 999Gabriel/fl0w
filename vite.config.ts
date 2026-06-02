import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

// Served as a GitHub Pages project page at https://999gabriel.github.io/fl0w/,
// so the build is prefixed with "/fl0w/"; dev runs at the root.
// NOTE: when the fl0wapp.com custom domain goes Active, switch base back to "/"
// for the build and restore public/CNAME (an apex domain has no path prefix).
// Two entry points:
//   index.html      -> landing page          (served at /fl0w/)
//   app/index.html  -> the React app itself  (served at /fl0w/app/)
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/fl0w/" : "/",
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
}));
