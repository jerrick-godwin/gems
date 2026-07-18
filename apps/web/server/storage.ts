import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { IncomingMessage } from "node:http";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import sharp from "sharp";
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { StorageUploadRequest, StorageUploadTarget } from "@gems/schemas";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || "";
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || "user-uploads";
const uploadUrlTtlMinutes = Number(process.env.AZURE_STORAGE_UPLOAD_URL_TTL_MINUTES ?? 15);
const readUrlTtlMinutes = Number(process.env.AZURE_STORAGE_READ_URL_TTL_MINUTES ?? 60);
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const certificateContentTypes = new Set(["application/pdf"]);
const maxImageBytes = 2 * 1024 * 1024;
const maxCertificateBytes = 5 * 1024 * 1024;
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
  const constraint = userUploadConstraint(request);
  const blobKey = createUserBlobKey(userId, request);
  const expiresAt = new Date(Date.now() + uploadUrlTtlMinutes * 60 * 1000);

  if (!blobServiceClient || !sharedKeyCredential) {
    return {
      blobKey,
      uploadUrl: createLocalUploadUrl(blobKey, expiresAt, request.contentType, constraint.maxBytes),
      readUrl: createLocalReadUrl(blobKey),
      expiresAt: expiresAt.toISOString()
    };
  }

  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists();
  const blobClient = containerClient.getBlockBlobClient(blobKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobKey,
      permissions: BlobSASPermissions.parse("cw"),
      contentType: request.contentType,
      expiresOn: expiresAt
    },
    sharedKeyCredential
  ).toString();

  return {
    blobKey,
    uploadUrl: `${blobClient.url}?${sas}`,
    readUrl: createSignedReadUrl(blobKey),
    expiresAt: expiresAt.toISOString()
  };
}

export async function createListingCheckoutUploadTarget(
  sessionId: string,
  request: { kind: "photo" | "certificate"; fileName: string; contentType: string; size?: number }
): Promise<StorageUploadTarget> {
  const constraint = listingCheckoutUploadConstraint(request);
  const blobKey = createListingCheckoutBlobKey(sessionId, request);
  const expiresAt = new Date(Date.now() + uploadUrlTtlMinutes * 60 * 1000);

  if (!blobServiceClient || !sharedKeyCredential) {
    return {
      blobKey,
      uploadUrl: createLocalUploadUrl(blobKey, expiresAt, request.contentType, constraint.maxBytes),
      readUrl: createLocalReadUrl(blobKey),
      expiresAt: expiresAt.toISOString()
    };
  }

  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists();
  const blobClient = containerClient.getBlockBlobClient(blobKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobKey,
      permissions: BlobSASPermissions.parse("cw"),
      contentType: request.contentType,
      expiresOn: expiresAt
    },
    sharedKeyCredential
  ).toString();

  return {
    blobKey,
    uploadUrl: `${blobClient.url}?${sas}`,
    readUrl: createSignedReadUrl(blobKey),
    expiresAt: expiresAt.toISOString()
  };
}

export function createSignedReadUrl(blobKey: string) {
  if (!sharedKeyCredential || !accountName) return createLocalReadUrl(blobKey);

  const expiresOn = new Date(Date.now() + readUrlTtlMinutes * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobKey,
      permissions: BlobSASPermissions.parse("r"),
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

export interface LocalUploadCapability {
  contentType: string;
  maxBytes: number;
}

export function verifyLocalUploadCapability(blobKey: string, params: URLSearchParams): LocalUploadCapability | undefined {
  const expires = params.get("expires") ?? "";
  const contentType = params.get("contentType") ?? "";
  const maxBytesValue = params.get("maxBytes") ?? "";
  const signature = params.get("signature") ?? "";
  const expiresAt = Number(expires);
  const maxBytes = Number(maxBytesValue);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 < Date.now() || !Number.isInteger(maxBytes) || maxBytes <= 0 || !contentType || !signature) return undefined;
  const expected = crypto.createHmac("sha256", uploadCapabilitySecret()).update(uploadCapabilityPayload(blobKey, expires, contentType, maxBytesValue)).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return undefined;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected) ? { contentType, maxBytes } : undefined;
}

export async function saveLocalUpload(blobKey: string, request: IncomingMessage, capability: LocalUploadCapability) {
  const requestContentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (requestContentType !== capability.contentType.toLowerCase()) throw new Error("Upload content type does not match the signed capability.");
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > capability.maxBytes) throw new Error("Upload exceeds the signed size limit.");
  const target = localUploadPath(blobKey);
  await mkdir(dirname(target), { recursive: true });
  try {
    await new Promise<void>((resolveUpload, rejectUpload) => {
      const stream = createWriteStream(target);
      let bytes = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        request.unpipe(stream);
        stream.destroy();
        rejectUpload(error);
      };
      request.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > capability.maxBytes) fail(new Error("Upload exceeds the signed size limit."));
      });
      request.on("error", (error) => fail(error));
      stream.on("error", (error) => fail(error));
      stream.on("finish", () => {
        if (settled) return;
        settled = true;
        resolveUpload();
      });
      request.pipe(stream);
    });
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
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
  } else {
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

function createLocalUploadUrl(blobKey: string, expiresAt: Date, contentType: string, maxBytes: number) {
  const expires = Math.floor(expiresAt.getTime() / 1000).toString();
  const maxBytesValue = String(maxBytes);
  const signature = crypto.createHmac("sha256", uploadCapabilitySecret())
    .update(uploadCapabilityPayload(blobKey, expires, contentType, maxBytesValue))
    .digest("base64url");
  const params = new URLSearchParams({ key: blobKey, expires, contentType, maxBytes: maxBytesValue, signature });
  return `/api/v1/storage/local-upload?${params.toString()}`;
}

function uploadCapabilityPayload(blobKey: string, expires: string, contentType: string, maxBytes: string) {
  return `${blobKey}\n${expires}\n${contentType.toLowerCase()}\n${maxBytes}`;
}

function uploadCapabilitySecret() {
  const configured = process.env.STORAGE_CAPABILITY_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("STORAGE_CAPABILITY_SECRET is required for local uploads in production.");
  return "gems-local-upload-development-secret";
}

function userUploadConstraint(request: StorageUploadRequest) {
  const certificate = request.scope === "listing-certificate";
  const allowed = certificate ? certificateContentTypes : imageContentTypes;
  if (!allowed.has(request.contentType.toLowerCase())) throw new Error("Unsupported upload content type.");
  return { maxBytes: certificate ? maxCertificateBytes : maxImageBytes };
}

function listingCheckoutUploadConstraint(request: { kind: "photo" | "certificate"; contentType: string; size?: number }) {
  const certificate = request.kind === "certificate";
  const allowed = certificate ? certificateContentTypes : imageContentTypes;
  const maxBytes = certificate ? maxCertificateBytes : maxImageBytes;
  if (!allowed.has(request.contentType.toLowerCase())) throw new Error("Unsupported upload content type.");
  if (request.size !== undefined && (!Number.isFinite(request.size) || request.size <= 0 || request.size > maxBytes)) throw new Error("Upload exceeds the allowed size.");
  return { maxBytes };
}

function createLocalReadUrl(blobKey: string) {
  return `/uploads/${encodeURIComponent(blobKey)}`;
}

function thumbnailKeyFor(blobKey: string) {
  const extension = extname(blobKey);
  return `${extension ? blobKey.slice(0, -extension.length) : blobKey}.card.webp`;
}

function createUserBlobKey(userId: string, request: StorageUploadRequest) {
  const extension = extname(request.fileName).toLowerCase();
  const safeExtension = extension && extension.length <= 12 ? extension : "";
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
  request: { kind: "photo" | "certificate"; fileName: string }
) {
  const extension = extname(request.fileName).toLowerCase();
  const safeExtension = extension && extension.length <= 12 ? extension : "";
  const id = crypto.randomUUID();
  const folder = request.kind === "certificate" ? "certificates" : "media";
  return `listing-checkout-sessions/${sessionId}/${folder}/${id}${safeExtension}`;
}
