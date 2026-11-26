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
      includeAssets: ["icon.svg", "logo.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Annarrivé",
        short_name: "Annarrivé",
        description: "Ton plan de course, organisé autour de ta semaine",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Semaine shows its calendar view on a phone turned on its side (Android follows the manifest).
        orientation: "any",
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
        // iOS reads its startup images when the app is added to the home screen, never from the cache.
        globIgnores: ["splash-*.png"],
        navigateFallbackDenylist: [/^\/api/],
        // Only names with a content hash skip the revision: assets/app.js keeps its name and needs one.
        dontCacheBustURLsMatching: /-[\w-]{8}\.\w+$/,
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
        // Every other file imports this one: a hash in its name would rename them all at each deploy. The server
        // has it revalidated (apps/server/src/app.ts), and the service worker versions it by content.
        entryFileNames: "assets/app.js",
      },
    },
  },
  server: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
  preview: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
});
