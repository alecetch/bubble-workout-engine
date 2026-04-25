import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_BUCKET = process.env.S3_BUCKET || "media-assets";
const REGION = process.env.S3_REGION || "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT || undefined;
// S3_PUBLIC_ENDPOINT overrides the endpoint used when generating presigned download
// URLs. In local dev set this to the LAN-accessible MinIO address (e.g.
// http://192.168.1.213:9000) so mobile devices can fetch signed photo URLs.
const PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT || ENDPOINT;
export const PHYSIQUE_BUCKET = process.env.S3_PHYSIQUE_BUCKET || "physique-photos";

let _client = null;
let _publicClient = null;

function getClient() {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _client;
}

// Separate client for generating presigned GET URLs using the publicly reachable
// endpoint. Signing must use the same host that clients will actually connect to,
// so MinIO's HMAC verification passes.
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = new S3Client({
      region: REGION,
      ...(PUBLIC_ENDPOINT ? { endpoint: PUBLIC_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _publicClient;
}

export async function putObject(key, buffer, contentType, bucket = DEFAULT_BUCKET) {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }),
  );
  return key;
}

export async function deleteObject(key, bucket = DEFAULT_BUCKET) {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

// For client-facing URLs (signed against the publicly reachable endpoint).
export async function getPresignedUrl(key, expiresInSeconds = 3600, bucket = DEFAULT_BUCKET) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getPublicClient(), command, { expiresIn: expiresInSeconds });
}

// For server-side fetches (signed against the internal minio endpoint).
export async function getInternalPresignedUrl(key, expiresInSeconds = 60, bucket = DEFAULT_BUCKET) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
