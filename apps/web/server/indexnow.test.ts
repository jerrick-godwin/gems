import assert from "node:assert/strict";
import test from "node:test";
import { indexNowUrls, notifyIndexNow } from "./indexnow.js";

test("IndexNow builds canonical marketplace, sitemap, listing, and category URLs", () => {
  assert.deepEqual(indexNowUrls("https://gemslanka.lk", { id: "listing 1", gemTypeId: "blue-sapphire" }), [
    "https://gemslanka.lk/",
    "https://gemslanka.lk/sitemap.xml",
    "https://gemslanka.lk/listings/listing%201",
    "https://gemslanka.lk/gemstones/blue-sapphire"
  ]);
});

test("IndexNow is a no-op without a configured key", async () => {
  const previous = process.env.INDEXNOW_KEY;
  delete process.env.INDEXNOW_KEY;
  let called = false;
  try {
    assert.equal(await notifyIndexNow("https://gemslanka.lk", undefined, async () => {
      called = true;
      return new Response(null, { status: 200 });
    }), false);
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = previous;
  }
});

test("IndexNow submits the configured key and changed URLs", async () => {
  const previous = process.env.INDEXNOW_KEY;
  process.env.INDEXNOW_KEY = "gemslanka-index-key";
  let body: any;
  try {
    const sent = await notifyIndexNow("https://gemslanka.lk", { id: "listing-1", gemTypeId: "sapphire" }, async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    });
    assert.equal(sent, true);
    assert.equal(body.host, "gemslanka.lk");
    assert.equal(body.keyLocation, "https://gemslanka.lk/gemslanka-index-key.txt");
    assert.ok(body.urlList.includes("https://gemslanka.lk/listings/listing-1"));
    assert.ok(body.urlList.includes("https://gemslanka.lk/gemstones/sapphire"));
  } finally {
    if (previous === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = previous;
  }
});
