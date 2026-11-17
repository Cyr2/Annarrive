import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The top of the sky (styles/tokens.css): the status bar and the splash blend into it.
const BACKGROUND = "#FDEDE3";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app picks when to switch to a new version, never in the middle of an action.
      registerType: "prompt",
      // Inline: one request less, and nothing blocks the first paint.
      injectRegister: "inline",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Annarrivé",
        short_name: "Annarrivé",
        description: "Ton plan de course, organisé autour de ta semaine",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
        // Shows the server's notifications and opens their screen on tap; precaching stays generated.
        importScripts: ["/push-sw.js"],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      // A zod schema nobody reads (server inputs, Garmin) is dropped instead of being built at every launch.
      treeshake: { manualPureFunctions: ["z"] },
      output: {
        // Everything the first screen needs in one file: each extra chunk costs a round trip on a phone.
        codeSplitting: { groups: [{ name: "app", tags: ["$initial"] }] },
      },
    },
  },
  server: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
  preview: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
});
