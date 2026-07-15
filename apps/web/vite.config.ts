import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      outDir: "dist/client",
      manifest: true,
      ssrManifest: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          admin: resolve(__dirname, "admin.html"),
          public: resolve(__dirname, "src/entry-client.tsx")
        }
      }
    }
  };
});
