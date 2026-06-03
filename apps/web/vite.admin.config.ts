import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function serveAdminAtRoot() {
  return {
    name: "serve-admin-at-root",
    configureServer(server: { middlewares: { use: (middleware: (request: { url?: string }, response: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/" || request.url?.startsWith("/?")) request.url = "/admin.html";
        next();
      });
    },
    configurePreviewServer(server: { middlewares: { use: (middleware: (request: { url?: string }, response: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/" || request.url?.startsWith("/?")) request.url = "/admin.html";
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [serveAdminAtRoot(), react()]
});
