import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@dimforge/rapier3d-compat")) {
            return "rapier";
          }
          if (id.includes("three")) {
            return "three";
          }
          return undefined;
        },
      },
    },
  },
});
