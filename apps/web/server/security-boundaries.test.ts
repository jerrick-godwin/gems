import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { apiBodyLimit, readRequestBody, RequestBodyTooLarge } from "./request-body.js";

function request(chunks: Buffer[], headers: IncomingMessage["headers"] = {}) {
  return Object.assign(Readable.from(chunks), { headers }) as unknown as IncomingMessage;
}

test("body limits reject declared and streamed oversized requests", async () => {
  const resetLimit = apiBodyLimit("/api/v1/auth/password-reset");
  assert.ok(resetLimit < apiBodyLimit("/api/v1/payments/stripe/webhook"));
  await assert.rejects(readRequestBody(request([], { "content-length": String(resetLimit + 1) }), resetLimit), RequestBodyTooLarge);
  await assert.rejects(readRequestBody(request([Buffer.alloc(resetLimit), Buffer.from("x")]), resetLimit), RequestBodyTooLarge);
});

test("the webhook receives original bytes, including whitespace and multibyte characters", async () => {
  const original = Buffer.from('{ "name": "මැණික්" }\n');
  const input = request([original.subarray(0, 15), original.subarray(15)]);
  assert.deepEqual(await readRequestBody(input, original.length), original);
});

test("hosted authorization and request limits fail closed", async (t) => {
  process.env.VERCEL = "1";
  process.env.NODE_ENV = "production";
  process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    projectId: "fixture-admin-project",
    clientEmail: "service@fixture-admin-project.iam.gserviceaccount.com",
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" })
  });
  process.env.ADMIN_FIREBASE_UIDS = "fixture-admin";
  process.env.AZURE_STORAGE_CONNECTION_STRING = "";
  process.env.RESEND_API_KEY = "";
  const { handleApi } = await import("./server.js");
  const { getApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { verifyAdminFirebaseIdToken } = await import("./auth.js");
  t.mock.method(getAuth(getApp("admin")), "verifyIdToken", async (token: string, checkRevoked: boolean) => {
    assert.equal(checkRevoked, true);
    if (token === "revoked") throw new Error("Revoked");
    return { uid: token, email: "fixture@example.invalid" };
  });
  assert.deepEqual(await verifyAdminFirebaseIdToken("fixture-admin"), { email: "fixture@example.invalid", role: "admin" });
  await assert.rejects(verifyAdminFirebaseIdToken("unlisted"), /Admin role required/);
  await assert.rejects(verifyAdminFirebaseIdToken("revoked"), /Revoked/);

  async function call(method: string, url: string, chunks: Buffer[] = []) {
    const input = Object.assign(request(chunks), { method, url });
    let status = 0;
    const headers = new Headers();
    const output = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      writeHead: (code: number, values: Record<string, string>) => {
        status = code;
        for (const [name, value] of Object.entries(values)) headers.set(name, value);
      },
      end: () => {}
    } as unknown as import("node:http").ServerResponse;
    assert.equal(await handleApi(input, output), true);
    return { status, headers };
  }

  assert.equal((await call("PUT", "/api/v1/storage/local-upload?key=users%2F..%2Fpayload.html")).status, 404);
  assert.equal((await call("PUT", "/api/v1/storage/upload?key=users%2F..%2Fpayload.html")).status, 403);
  assert.equal((await call("POST", "/api/v1/auth/password-reset", [Buffer.alloc(4097)])).status, 413);
  const cancel = await call("GET", "/api/v1/payments/stripe/pay-fixture/cancel");
  assert.equal(cancel.status, 302);
  assert.equal(cancel.headers.get("location"), "/listings?payment=cancelled");
  assert.equal(cancel.headers.get("cache-control"), "no-store");
});
