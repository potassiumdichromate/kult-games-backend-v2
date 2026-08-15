import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

const s3 = new S3Client({
  endpoint: config.r2.endpoint,
  region: config.r2.region,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  forcePathStyle: true,
});

export function publicUrlForKey(key: string): string {
  return `${config.r2.publicUrl}/${key.replace(/^\/+/, '')}`;
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType?: string,
  ttlSecs = config.r2.presignTtl,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: ttlSecs });
  return { uploadUrl, publicUrl: publicUrlForKey(key) };
}

export async function fileExists(publicUrl: string): Promise<boolean> {
  const key = extractR2Key(publicUrl);
  if (!key) return false;

  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function extractR2Key(url: string): string | null {
  try {
    const u = new URL(url);
    const bucket = config.r2.bucket;
    const endpointHost = new URL(config.r2.endpoint).hostname;
    const publicBase = new URL(`${config.r2.publicUrl}/`);

    // Public R2 development/custom domain URL.
    if (u.origin === publicBase.origin && u.pathname.startsWith(publicBase.pathname)) {
      return u.pathname.slice(publicBase.pathname.length);
    }

    // R2 S3 API virtual-hosted URL.
    if (u.hostname === `${bucket}.${endpointHost}`) {
      return u.pathname.replace(/^\//, '');
    }
    // R2 S3 API path-style URL.
    const prefix = `/${bucket}/`;
    if (u.hostname === endpointHost && u.pathname.startsWith(prefix)) {
      return u.pathname.slice(prefix.length);
    }
    return null;
  } catch {
    return null;
  }
}

export function assertTrustedR2Url(url: string): void {
  if (!extractR2Key(url)) {
    throw new Error('Asset URL must point to the configured R2 bucket');
  }
}
