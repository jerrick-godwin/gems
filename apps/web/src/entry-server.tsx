import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { PublicDocument, type PublicRenderPayload } from "./public/PublicDocument.js";

export function serializePublicState(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
    .replace(/<\\\/script/gi, "\\u003c/script");
}

export function renderPublicPage(payload: PublicRenderPayload, options: { abortMs?: number } = {}) {
  const serializedState = serializePublicState(payload);
  return new Promise<PassThrough>((resolve, reject) => {
    let resolved = false;
    const output = new PassThrough();
    const stream = renderToPipeableStream(<PublicDocument {...payload} serializedState={serializedState} />, {
      identifierPrefix: "gems-public-",
      onShellReady() {
        resolved = true;
        resolve(output);
        stream.pipe(output);
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        if (!resolved) reject(error);
        else console.error("SSR stream error", error);
      }
    });
    setTimeout(() => stream.abort(), options.abortMs ?? 10_000).unref();
  });
}
