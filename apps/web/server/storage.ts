import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { IncomingMessage } from "node:http";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { StorageUploadRequest, StorageUploadTarget } from "@gems/schemas";

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
  const blobKey = createUserBlobKey(userId, request);
  const expiresAt = new Date(Date.now() + uploadUrlTtlMinutes * 60 * 1000);

  if (!blobServiceClient || !sharedKeyCredential) {
    return {
      blobKey,
      uploadUrl: createLocalUploadUrl(blobKey),
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

export async function saveLocalUpload(blobKey: string, request: IncomingMessage) {
  const target = localUploadPath(blobKey);
  await mkdir(dirname(target), { recursive: true });
  await new Promise<void>((resolveUpload, rejectUpload) => {
    const stream = createWriteStream(target);
    request.pipe(stream);
    request.on("error", rejectUpload);
    stream.on("error", rejectUpload);
    stream.on("finish", resolveUpload);
  });
}

function createLocalUploadUrl(blobKey: string) {
  return `/api/v1/storage/local-upload?key=${encodeURIComponent(blobKey)}`;
}

function createLocalReadUrl(blobKey: string) {
  return `/uploads/${encodeURIComponent(blobKey)}`;
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
