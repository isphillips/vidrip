import {
  createUniversalStoragePlugin,
  createStorageKeyBuilder,
  getContentType,
  parseStorageUri,
} from "@hot-updater/plugin-core";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";

// Custom hot-updater storage plugin that puts OTA bundles on Tigris (S3-compatible, free egress).
//
// Bundles are the app's JS — already shipped to every device — so we store them PUBLIC-READ and record
// each bundle's storageUri as its plain public https URL (e.g. https://<bucket>.t3.storage.dev/<key>).
// That's deliberate: hot-updater's server runtime returns any http(s) storageUri VERBATIM and reads the
// manifest with a plain fetch() (see @hot-updater/server storageAccess) — so the update-server edge
// function needs ZERO Tigris code. It keeps its supabaseEdgeFunctionStorage adapter only to resolve the
// OLD supabase-storage:// bundles until they age out.
//
// supportedProtocol is "https" so the CLI/deploy tooling routes these URIs back to this plugin for
// upload/delete/exists; the S3 bucket + key are taken from config + the URL path (publicUrl is the
// bucket-root, so the object key is exactly the URL pathname).

export interface TigrisStorageConfig {
  /** Tigris S3 API endpoint, e.g. https://t3.storage.dev */
  endpoint: string;
  /** Tigris uses "auto". */
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** Public bucket-root URL with NO trailing slash, e.g. https://<bucket>.t3.storage.dev (or a CDN domain). */
  publicUrl: string;
  /** Optional key prefix inside the bucket. */
  basePath?: string;
  /** Object ACL applied on upload. Default "public-read" (bundles are public); set null for a bucket
   *  that's already public at the bucket level if the provider rejects per-object ACLs. */
  objectAcl?: "public-read" | null;
  /** Path-style addressing. Default false (Tigris uses virtual-hosted <bucket>.t3.storage.dev). */
  forcePathStyle?: boolean;
}

export const tigrisStorage = createUniversalStoragePlugin({
  name: "tigrisStorage",
  supportedProtocol: "https",
  factory: (config: TigrisStorageConfig) => {
    const s3 = new S3Client({
      region: config.region ?? "auto",
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    const publicBase = config.publicUrl.replace(/\/+$/, "");
    const getStorageKey = createStorageKeyBuilder(config.basePath);
    const acl = config.objectAcl === undefined ? "public-read" : config.objectAcl;
    // publicUrl is the bucket root, so the object key is exactly the storageUri's path.
    const keyOf = (storageUri: string) => parseStorageUri(storageUri, "https").key;

    return {
      node: {
        async upload(key: string, filePath: string) {
          const Body = await fs.readFile(filePath);
          const Key = getStorageKey(key, path.basename(filePath));
          await s3.send(
            new PutObjectCommand({
              Bucket: config.bucketName,
              Key,
              Body,
              ContentType: getContentType(filePath),
              CacheControl: "max-age=31536000",
              ...(acl ? { ACL: acl } : {}),
            }),
          );
          return { storageUri: `${publicBase}/${Key}` };
        },
        async delete(storageUri: string) {
          await s3.send(
            new DeleteObjectCommand({ Bucket: config.bucketName, Key: keyOf(storageUri) }),
          );
        },
        async exists(storageUri: string) {
          try {
            await s3.send(
              new HeadObjectCommand({ Bucket: config.bucketName, Key: keyOf(storageUri) }),
            );
            return true;
          } catch (error: any) {
            if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
              return false;
            }
            throw error;
          }
        },
        async downloadFile(storageUri: string, filePath: string) {
          const res = await s3.send(
            new GetObjectCommand({ Bucket: config.bucketName, Key: keyOf(storageUri) }),
          );
          if (!res.Body) throw new Error(`Failed to download bundle: ${storageUri}`);
          const bytes = await (res.Body as any).transformToByteArray();
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, bytes);
        },
      },
      runtime: {
        // Bundles are public — read the manifest straight over https.
        async readText(storageUri: string) {
          const r = await fetch(storageUri);
          if (r.status === 404) return null;
          if (!r.ok) throw new Error(`Failed to read storage text (${r.status}): ${storageUri}`);
          return r.text();
        },
        // Already a public URL — return it verbatim.
        async getDownloadUrl(storageUri: string) {
          return { fileUrl: storageUri };
        },
      },
    };
  },
});
