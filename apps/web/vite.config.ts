import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BACKGROUND = "#F2F2F7";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app picks when to switch to a new version, never in the middle of an action.
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Talaria",
        short_name: "Talaria",
        description: "Ton plan de course, organisé autour de ta semaine",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Everything the first screen needs in one file: each extra chunk costs a round trip on a phone.
        codeSplitting: { groups: [{ name: "app", tags: ["$initial"] }] },
      },
    },
  },
  server: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
  preview: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
});
