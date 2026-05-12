import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built assets work when dropped into the Android
  // harness APK (served from https://appassets.androidplatform.net/...) or
  // served from any subpath on a dev server.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
