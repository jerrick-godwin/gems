import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDirectory = new URL("../../public/", import.meta.url);
const assetDirectory = new URL("assets/", publicDirectory);
const sourcePath = fileURLToPath(new URL("gemslanka-logo.png", assetDirectory));
const masterPath = fileURLToPath(new URL("logo-mark-rounded-512.png", assetDirectory));

await mkdir(assetDirectory, { recursive: true });

const roundedMask = Buffer.from(`
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="96" fill="#fff" />
  </svg>
`);

const master = await sharp(sourcePath)
  .extract({ left: 127, top: 0, width: 1000, height: 1000 })
  .resize(512, 512, { fit: "fill" })
  .ensureAlpha()
  .composite([{ input: roundedMask, blend: "dest-in" }])
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(masterPath, master);

const variants = [
  { size: 32, url: new URL("favicon-rounded-32.png", publicDirectory) },
  { size: 180, url: new URL("apple-touch-icon-rounded.png", publicDirectory) },
  { size: 192, url: new URL("logo-mark-rounded-192.png", assetDirectory) }
];

for (const { size, url } of variants) {
  const image = await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(fileURLToPath(url), image);
}

const icoFrames = await Promise.all([16, 32, 48].map(async (size) => ({
  size,
  data: await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
})));

await writeFile(fileURLToPath(new URL("favicon.ico", publicDirectory)), createIco(icoFrames));

function createIco(frames) {
  const directorySize = 6 + (16 * frames.length);
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let imageOffset = directorySize;
  frames.forEach(({ size, data }, index) => {
    const offset = 6 + (index * 16);
    header.writeUInt8(size === 256 ? 0 : size, offset);
    header.writeUInt8(size === 256 ? 0 : size, offset + 1);
    header.writeUInt8(0, offset + 2);
    header.writeUInt8(0, offset + 3);
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(data.length, offset + 8);
    header.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += data.length;
  });

  return Buffer.concat([header, ...frames.map(({ data }) => data)]);
}
