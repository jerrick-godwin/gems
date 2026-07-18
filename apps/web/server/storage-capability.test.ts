import assert from "node:assert/strict";
import test from "node:test";
import { createUserUploadTarget, verifyLocalUploadCapability } from "./storage.js";

test("local upload capabilities bind key, content type, size, and expiry", async () => {
  const target = await createUserUploadTarget("user-1", {
    scope: "profile",
    fileName: "avatar.webp",
    contentType: "image/webp"
  });
  const url = new URL(target.uploadUrl, "http://127.0.0.1:4100");
  const key = url.searchParams.get("key")!;
  const capability = verifyLocalUploadCapability(key, url.searchParams);
  assert.deepEqual(capability, { contentType: "image/webp", maxBytes: 2 * 1024 * 1024 });

  url.searchParams.set("maxBytes", String(20 * 1024 * 1024));
  assert.equal(verifyLocalUploadCapability(key, url.searchParams), undefined);
  assert.equal(verifyLocalUploadCapability(`${key}-other`, new URL(target.uploadUrl, "http://127.0.0.1:4100").searchParams), undefined);
});

test("upload target creation rejects unsupported content types", async () => {
  await assert.rejects(
    createUserUploadTarget("user-1", { scope: "profile", fileName: "payload.html", contentType: "text/html" }),
    /Unsupported upload content type/
  );
});
