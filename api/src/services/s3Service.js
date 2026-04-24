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
export const PHYSIQUE_BUCKET = process.env.S3_PHYSIQUE_BUCKET || "physique-photos";

let _client = null;

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

export async function getPresignedUrl(key, expiresInSeconds = 3600, bucket = DEFAULT_BUCKET) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
