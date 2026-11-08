import type { IncomingMessage } from "node:http";

export const maxLocalUploadBytes = 2 * 1024 * 1024;
const maxJsonBytes = 256 * 1024;
const maxWebhookBytes = 1024 * 1024;

export class RequestBodyTooLarge extends Error {}

export function apiBodyLimit(path: string) {
  if (path === "/api/v1/storage/local-upload" || path === "/api/v1/storage/upload") return maxLocalUploadBytes;
  if (path === "/api/v1/payments/stripe/webhook") return maxWebhookBytes;
  if (path === "/api/v1/auth/password-reset" || path === "/api/v1/metrics/web-vitals") return 4096;
  return maxJsonBytes;
}

export async function readRequestBody(request: IncomingMessage, limit: number) {
  if (Number(request.headers["content-length"]) > limit) throw new RequestBodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  // Leave the socket open long enough to return a 413 for streamed bodies.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new RequestBodyTooLarge();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}
