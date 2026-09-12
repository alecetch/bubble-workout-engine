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
export const EXERCISE_MEDIA_BUCKET = process.env.S3_EXERCISE_MEDIA_BUCKET || "exercise-media";

let _client = null;
let _publicClient = null;
let _exerciseMediaClient = null;

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

// The exercise-media bucket is a separate Tigris project from the default
// bucket (formas3), with its own dedicated access key/secret - Tigris scopes
// credentials per-project, they aren't interchangeable. Falls back to the
// default credentials when the dedicated ones aren't set (local dev's MinIO
// uses one shared credential pair for every bucket).
export function getClientForBucket(bucket) {
  if (bucket !== EXERCISE_MEDIA_BUCKET) return getClient();
  const accessKeyId = process.env.S3_EXERCISE_MEDIA_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.S3_EXERCISE_MEDIA_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || "";
  if (!_exerciseMediaClient) {
    _exerciseMediaClient = new S3Client({
      region: REGION,
      ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _exerciseMediaClient;
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
  await getClientForBucket(bucket).send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }),
  );
  return key;
}

export async function getObject(key, bucket = DEFAULT_BUCKET) {
  const result = await getClientForBucket(bucket).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function getObjectStream(key, bucket = DEFAULT_BUCKET, range = undefined) {
  return getClientForBucket(bucket).send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range ? { Range: range } : {}),
    }),
  );
}

export async function deleteObject(key, bucket = DEFAULT_BUCKET) {
  await getClientForBucket(bucket).send(
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
  return getSignedUrl(getClientForBucket(bucket), command, { expiresIn: expiresInSeconds });
}
