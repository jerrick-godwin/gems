import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const publicDirectory = new URL("../public/", import.meta.url);

test("rounded favicon assets use the mark-only family with transparent corners", async () => {
  const paths = [
    ["favicon-rounded-32.png", 32],
    ["apple-touch-icon-rounded.png", 180],
    ["assets/logo-mark-rounded-192.png", 192],
    ["assets/logo-mark-rounded-512.png", 512]
  ] as const;

  for (const [relativePath, expectedSize] of paths) {
    const image = sharp(fileURLToPath(new URL(relativePath, publicDirectory)));
    const metadata = await image.metadata();
    assert.equal(metadata.width, expectedSize);
    assert.equal(metadata.height, expectedSize);
    assert.equal(metadata.hasAlpha, true);

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[((y * info.width) + x) * info.channels + 3];
    assert.ok(alphaAt(0, 0) <= 4);
    assert.ok(alphaAt(info.width - 1, 0) <= 4);
    assert.ok(alphaAt(0, info.height - 1) <= 4);
    assert.ok(alphaAt(info.width - 1, info.height - 1) <= 4);
    assert.equal(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)), 255);
  }
});

test("favicon ICO contains 16, 32, and 48 pixel PNG frames", async () => {
  const ico = await readFile(new URL("favicon.ico", publicDirectory));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([0, 1, 2].map((index) => ico.readUInt8(6 + (index * 16))), [16, 32, 48]);

  for (let index = 0; index < 3; index += 1) {
    const entryOffset = 6 + (index * 16);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);
    assert.deepEqual([...ico.subarray(imageOffset, imageOffset + 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("static document and web manifest reference the rounded icon family", async () => {
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", publicDirectory), "utf8")) as { icons: Array<{ src: string }> };

  assert.match(indexHtml, /href="\/favicon-rounded-32\.png"/);
  assert.match(indexHtml, /href="\/assets\/logo-mark-rounded-192\.png"/);
  assert.match(indexHtml, /href="\/apple-touch-icon-rounded\.png"/);
  assert.deepEqual(manifest.icons.map(({ src }) => src), [
    "/assets/logo-mark-rounded-192.png",
    "/assets/logo-mark-rounded-512.png"
  ]);
});
