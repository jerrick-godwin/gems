import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import sharp from "sharp";
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { StorageUploadRequest, StorageUploadTarget } from "@gems/schemas";
import { maxLocalUploadBytes } from "./request-body.js";

export const localUploadsAllowed = process.env.NODE_ENV === "development"
  && (!process.env.VERCEL || process.env.VERCEL_ENV === "development");
const localUploadSecret = crypto.randomBytes(32);
const imageExtensions = new Map([
  ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"],
  ["image/gif", ".gif"], ["image/avif", ".avif"]
]);

export function uploadExtension(contentType: string, allowPdf: boolean) {
  const extension = imageExtensions.get(contentType) ?? (allowPdf && contentType === "application/pdf" ? ".pdf" : undefined);
  if (!extension) throw new Error("Unsupported upload type. Use JPEG, PNG, WebP, GIF, AVIF or PDF where accepted.");
  return extension;
}

function requireLocalUploads() {
  if (!localUploadsAllowed) throw new Error("Object storage is not configured.");
}

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || "";
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || "user-uploads";
const uploadUrlTtlMinutes = Number(process.env.AZURE_STORAGE_UPLOAD_URL_TTL_MINUTES ?? 15);
const readUrlTtlMinutes = Number(process.env.AZURE_STORAGE_READ_URL_TTL_MINUTES ?? 60);
const localUploadRoot = process.env.LOCAL_UPLOADS_DIR
  ? resolve(process.env.LOCAL_UPLOADS_DIR)
  : fileURLToPath(new URL("../.local-uploads/", import.meta.url));

let blobServiceClient: BlobServiceClient | undefined;
let sharedKeyCredential: StorageSharedKeyCredential | undefined;
let accountName = "";

if (AZURE_STORAGE_CONNECTION_STRING) {
  try {
    blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const account = /AccountName=([^;]+)/.exec(AZURE_STORAGE_CONNECTION_STRING)?.[1];
    const key = /AccountKey=([^;]+)/.exec(AZURE_STORAGE_CONNECTION_STRING)?.[1];
    if (account && key) {
      accountName = account;
      sharedKeyCredential = new StorageSharedKeyCredential(account, key);
    }
  } catch (error) {
    console.warn("Failed to initialize Azure Blob Service Client:", error);
  }
}

export async function createUserUploadTarget(userId: string, request: StorageUploadRequest): Promise<StorageUploadTarget> {
  return createUploadTarget(createUserBlobKey(userId, request));
}

export async function createListingCheckoutUploadTarget(
  sessionId: string,
  request: { kind: "photo" | "certificate"; fileName: string; contentType: string }
): Promise<StorageUploadTarget> {
  return createUploadTarget(createListingCheckoutBlobKey(sessionId, request));
}

function createUploadTarget(blobKey: string): StorageUploadTarget {
  const hosted = Boolean(blobServiceClient && sharedKeyCredential);
  if (!hosted) requireLocalUploads();
  const expiresAt = new Date(Date.now() + uploadUrlTtlMinutes * 60 * 1000);
  const expiry = String(expiresAt.getTime());
  const path = hosted ? "/api/v1/storage/upload" : "/api/v1/storage/local-upload";
  const signature = uploadSignature(blobKey, expiry, hosted);
  return {
    blobKey,
    uploadUrl: `${path}?key=${encodeURIComponent(blobKey)}&permit=${expiry}.${signature}`,
    readUrl: createSignedReadUrl(blobKey),
    expiresAt: expiresAt.toISOString()
  };
}

export function createSignedReadUrl(blobKey: string) {
  if (!sharedKeyCredential || !accountName) return localUploadsAllowed ? createLocalReadUrl(blobKey) : "";

  const expiresOn = new Date(Date.now() + readUrlTtlMinutes * 60 * 1000);
  const contentType = contentTypeForKey(blobKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobKey,
      permissions: BlobSASPermissions.parse("r"),
      contentType,
      expiresOn
    },
    sharedKeyCredential
  ).toString();
  return `https://${accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blobKey}?${sas}`;
}

export function blobKeyFromLocalReadPath(pathname: string) {
  if (!pathname.startsWith("/uploads/")) return undefined;
  return decodeURIComponent(pathname.slice("/uploads/".length));
}

export function localUploadPath(blobKey: string) {
  const target = resolve(localUploadRoot, blobKey);
  const targetRelative = relative(localUploadRoot, target);
  if (targetRelative.startsWith("..") || resolve(targetRelative) === targetRelative) {
    throw new Error("Invalid upload path");
  }
  return target;
}

export function verifyUploadPermit(blobKey: string, permit: string | null, hosted: boolean) {
  if (!permit || (hosted ? !blobServiceClient || !sharedKeyCredential : !localUploadsAllowed)) return false;
  const [expiry, signature, extra] = permit.split(".");
  if (extra !== undefined || !signature || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return false;
  const expected = Buffer.from(uploadSignature(blobKey, expiry, hosted));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

async function validateFileBytes(bytes: Buffer, extension: string) {
  if (!bytes.length || bytes.length > maxLocalUploadBytes) throw new Error("Invalid upload size.");
  if (extension === ".pdf") {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF file.");
    return;
  }
  const { format, compression, width, height } = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
  if (!width || !height || width * height > 25_000_000) throw new Error("Uploaded image dimensions are too large.");
  const actual = format === "jpeg" ? ".jpg" : format === "heif" && compression === "av1" ? ".avif" : `.${format}`;
  if (actual !== (extension === ".jpeg" ? ".jpg" : extension)) throw new Error("Uploaded image type does not match the file.");
}

export async function saveLocalUpload(blobKey: string, bytes: Buffer) {
  requireLocalUploads();
  const target = localUploadPath(blobKey);
  await validateFileBytes(bytes, extname(target));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}

export async function saveHostedUpload(blobKey: string, bytes: Buffer) {
  if (!blobServiceClient || !sharedKeyCredential) throw new Error("Object storage is not configured.");
  await validateFileBytes(bytes, extname(blobKey));
  const container = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();
  await container.getBlockBlobClient(blobKey).uploadData(bytes, {
    conditions: { ifNoneMatch: "*" },
    blobHTTPHeaders: { blobContentType: contentTypeForKey(blobKey) }
  });
}

export async function verifyStoredUpload(blobKey: string, expectedSize?: number) {
  let bytes: Buffer;
  if (blobServiceClient && sharedKeyCredential) {
    const blob = blobServiceClient.getContainerClient(CONTAINER_NAME).getBlockBlobClient(blobKey);
    const { contentLength, etag } = await blob.getProperties();
    if (!contentLength || contentLength > maxLocalUploadBytes || (expectedSize !== undefined && contentLength !== expectedSize)) {
      throw new Error("Invalid upload size.");
    }
    bytes = await blob.downloadToBuffer(0, contentLength, { conditions: { ifMatch: etag } });
  } else {
    requireLocalUploads();
    const path = localUploadPath(blobKey);
    const { size } = await stat(path);
    if (!size || size > maxLocalUploadBytes || (expectedSize !== undefined && size !== expectedSize)) {
      throw new Error("Invalid upload size.");
    }
    bytes = await readFile(path);
  }
  await validateFileBytes(bytes, extname(blobKey));
}

export async function deleteBlob(blobKey: string) {
  if (blobServiceClient && sharedKeyCredential) {
    try {
      const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      const blobClient = containerClient.getBlockBlobClient(blobKey);
      await blobClient.deleteIfExists();
    } catch (e) {
      console.warn(`Failed to delete blob ${blobKey} from Azure:`, e);
    }
  } else if (localUploadsAllowed) {
    try {
      const target = localUploadPath(blobKey);
      await unlink(target);
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.warn(`Failed to delete local blob ${blobKey}:`, e);
      }
    }
  }
}

export async function ensureListingCardThumbnail(blobKey: string) {
  const thumbnailKey = thumbnailKeyFor(blobKey);
  if (blobServiceClient && sharedKeyCredential) {
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const thumbnailClient = containerClient.getBlockBlobClient(thumbnailKey);
    if (!await thumbnailClient.exists()) {
      const source = await containerClient.getBlockBlobClient(blobKey).downloadToBuffer();
      const thumbnail = await sharp(source).rotate().resize(800, 600, { fit: "cover", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      await thumbnailClient.uploadData(thumbnail, { blobHTTPHeaders: { blobContentType: "image/webp", blobCacheControl: "public, max-age=31536000, immutable" } });
    }
  } else {
    requireLocalUploads();
    const sourcePath = localUploadPath(blobKey);
    const thumbnailPath = localUploadPath(thumbnailKey);
    try {
      await access(thumbnailPath);
    } catch {
      await mkdir(dirname(thumbnailPath), { recursive: true });
      const thumbnail = await sharp(await readFile(sourcePath)).rotate().resize(800, 600, { fit: "cover", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      await writeFile(thumbnailPath, thumbnail);
    }
  }
  return { thumbnailKey, thumbnailUrl: createSignedReadUrl(thumbnailKey), width: 800, height: 600 };
}

function contentTypeForKey(blobKey: string) {
  const extension = extname(blobKey).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".jpeg") return "image/jpeg";
  return [...imageExtensions].find(([, value]) => value === extension)?.[0];
}

function uploadSignature(blobKey: string, expiry: string, hosted: boolean) {
  const secret = hosted ? AZURE_STORAGE_CONNECTION_STRING : localUploadSecret;
  return crypto.createHmac("sha256", secret).update(JSON.stringify(["gemslanka-upload-v1", blobKey, expiry])).digest("base64url");
}

function createLocalReadUrl(blobKey: string) {
  return `/uploads/${encodeURIComponent(blobKey)}`;
}

function thumbnailKeyFor(blobKey: string) {
  const extension = extname(blobKey);
  return `${extension ? blobKey.slice(0, -extension.length) : blobKey}.card.webp`;
}

function createUserBlobKey(userId: string, request: StorageUploadRequest) {
  const safeExtension = uploadExtension(request.contentType, request.scope === "listing-certificate");
  const id = crypto.randomUUID();

  if (request.scope === "profile") {
    return `users/${userId}/profile/${id}${safeExtension}`;
  }

  if (!request.listingId) {
    throw new Error("listingId is required for listing storage uploads");
  }

  const folder = request.scope === "listing-certificate" ? "certificates" : "media";
  return `users/${userId}/listings/${request.listingId}/${folder}/${id}${safeExtension}`;
}

function createListingCheckoutBlobKey(
  sessionId: string,
  request: { kind: "photo" | "certificate"; contentType: string }
) {
  const safeExtension = uploadExtension(request.contentType, request.kind === "certificate");
  const id = crypto.randomUUID();
  const folder = request.kind === "certificate" ? "certificates" : "media";
  return `listing-checkout-sessions/${sessionId}/${folder}/${id}${safeExtension}`;
}
