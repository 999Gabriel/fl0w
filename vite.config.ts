import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

// Served from the custom apex domain fl0wapp.com (see public/CNAME), so the site
// lives at the root — base must be "/" in every mode. (It was "/fl0w/" back when
// this was a github.io/fl0w/ project page; an apex domain has no path prefix.)
// Two entry points:
//   index.html      -> landing page          (served at /)
//   app/index.html  -> the React app itself  (served at /app/)
export default defineConfig(() => ({
  base: "/",
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
