import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const REGION = import.meta.env.VITE_AWS_S3_REGION || 'ap-south-1';
const RESUMES_BUCKET =
  import.meta.env.VITE_AWS_S3_RESUMES_BUCKET ||
  import.meta.env.VITE_AWS_S3_BUCKET_NAME ||
  'interviewxpert-resumes-509594260417';
const VIDEOS_BUCKET =
  import.meta.env.VITE_AWS_S3_VIDEOS_BUCKET ||
  import.meta.env.VITE_AWS_S3_BUCKET_NAME ||
  'interviewxpert-videos-509594260417';
/** @deprecated Prefer RESUMES_BUCKET / VIDEOS_BUCKET */
const LEGACY_BUCKET = import.meta.env.VITE_AWS_S3_BUCKET_NAME || RESUMES_BUCKET;
const ACCESS_KEY_ID = import.meta.env.VITE_AWS_S3_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_S3_SECRET_ACCESS_KEY || '';

export type S3AssetKind = 'resume' | 'video' | 'audio' | 'image' | 'other';

export interface S3FileItem {
  key: string;
  url: string;
  size: number;
  lastModified: Date;
  category: 'Video' | 'Resume' | 'Image' | 'Audio' | 'Other';
  ageInDays: number;
  bucket: string;
}

let s3ClientInstance: S3Client | null = null;

const getS3Client = (): S3Client => {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });
  }
  return s3ClientInstance;
};

export const isS3Configured = (): boolean => {
  return Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && RESUMES_BUCKET && VIDEOS_BUCKET);
};

export const getResumesBucket = () => RESUMES_BUCKET;
export const getVideosBucket = () => VIDEOS_BUCKET;

const publicObjectUrl = (bucket: string, key: string) =>
  `https://${bucket}.s3.${REGION}.amazonaws.com/${key}`;

const resolveAssetKind = (
  blob: Blob | File,
  resourceType: 'video' | 'image' | 'auto' | 'raw'
): { kind: S3AssetKind; folder: string; mimeType: string } => {
  const mimeType = blob.type || (resourceType === 'video' ? 'video/webm' : 'application/pdf');
  const fileName = (blob as File).name || '';

  if (resourceType === 'video' || mimeType.startsWith('video/')) {
    return { kind: 'video', folder: 'videos/', mimeType };
  }
  if (mimeType.startsWith('audio/')) {
    return { kind: 'audio', folder: 'audio/', mimeType };
  }
  if (mimeType.startsWith('image/') || resourceType === 'image') {
    return { kind: 'image', folder: 'images/', mimeType };
  }
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('word') ||
    mimeType.includes('officedocument') ||
    mimeType.includes('text') ||
    resourceType === 'raw' ||
    fileName.match(/\.(pdf|docx?|txt)$/i)
  ) {
    return { kind: 'resume', folder: 'resumes/', mimeType };
  }
  return { kind: 'other', folder: 'documents/', mimeType };
};

const bucketForKind = (kind: S3AssetKind): string => {
  if (kind === 'video' || kind === 'audio') return VIDEOS_BUCKET;
  return RESUMES_BUCKET;
};

const bucketFromUrl = (url: string): string | null => {
  try {
    if (url.includes(`${RESUMES_BUCKET}.s3.`)) return RESUMES_BUCKET;
    if (url.includes(`${VIDEOS_BUCKET}.s3.`)) return VIDEOS_BUCKET;
    if (LEGACY_BUCKET && url.includes(`${LEGACY_BUCKET}.s3.`)) return LEGACY_BUCKET;

    // path-style: s3.region.amazonaws.com/bucket/key
    const match = url.match(/\.amazonaws\.com\/([^/]+)\//);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  return null;
};

/**
 * Upload blob/file directly to the resumes or videos Amazon S3 bucket.
 */
export const uploadToS3 = async (
  blob: Blob | File,
  resourceType: 'video' | 'image' | 'auto' | 'raw' = 'auto',
  customFileName?: string
): Promise<string> => {
  if (!isS3Configured()) {
    console.warn(
      'AWS S3 credentials missing. Check VITE_AWS_S3_ACCESS_KEY_ID & VITE_AWS_S3_SECRET_ACCESS_KEY in .env'
    );
  }

  const { kind, folder, mimeType } = resolveAssetKind(blob, resourceType);
  const bucket = bucketForKind(kind);
  const fileExtension =
    mimeType.split('/')[1]?.split(';')[0] || (resourceType === 'video' ? 'webm' : 'pdf');
  const baseName = customFileName || (blob as File).name || `file_${Date.now()}.${fileExtension}`;
  const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${folder}${Date.now()}_${cleanName}`;

  try {
    const s3 = getS3Client();
    const arrayBuffer = await blob.arrayBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: mimeType,
      })
    );

    const publicUrl = publicObjectUrl(bucket, key);
    console.log(`Uploaded successfully to Amazon S3 (${bucket}):`, publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('Amazon S3 Upload Error:', error);
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error(
        'Failed to connect to AWS S3. Please ensure CORS is enabled on your S3 bucket permissions in AWS and your AWS Region is correct.'
      );
    }
    throw error;
  }
};

const listBucketObjects = async (bucket: string, prefix?: string): Promise<S3FileItem[]> => {
  const s3 = getS3Client();
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || '',
    })
  );
  if (!response.Contents) return [];

  const now = new Date();
  return response.Contents.map((obj) => {
    const key = obj.Key || '';
    const lastModified = obj.LastModified || new Date();
    const ageInDays = Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 3600 * 24));
    const url = publicObjectUrl(bucket, key);
    const lowerKey = key.toLowerCase();

    let category: S3FileItem['category'] = 'Other';
    if (
      bucket === VIDEOS_BUCKET ||
      lowerKey.startsWith('videos/') ||
      lowerKey.includes('video') ||
      lowerKey.endsWith('.webm') ||
      lowerKey.endsWith('.mp4') ||
      lowerKey.endsWith('.mov')
    ) {
      category = lowerKey.startsWith('audio/') || lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav')
        ? 'Audio'
        : 'Video';
      if (lowerKey.startsWith('audio/') || lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav') || lowerKey.endsWith('.ogg')) {
        category = 'Audio';
      }
    } else if (
      lowerKey.startsWith('resumes/') ||
      lowerKey.includes('resume') ||
      lowerKey.endsWith('.pdf') ||
      lowerKey.endsWith('.docx') ||
      lowerKey.endsWith('.doc') ||
      lowerKey.endsWith('.txt')
    ) {
      category = 'Resume';
    } else if (
      lowerKey.startsWith('images/') ||
      lowerKey.endsWith('.jpg') ||
      lowerKey.endsWith('.jpeg') ||
      lowerKey.endsWith('.png') ||
      lowerKey.endsWith('.svg')
    ) {
      category = 'Image';
    }

    return {
      key,
      url,
      size: obj.Size || 0,
      lastModified,
      category,
      ageInDays,
      bucket,
    };
  });
};

/**
 * List objects from both resumes and videos buckets.
 */
export const listS3Objects = async (prefix?: string): Promise<S3FileItem[]> => {
  try {
    const [resumes, videos] = await Promise.all([
      listBucketObjects(RESUMES_BUCKET, prefix),
      listBucketObjects(VIDEOS_BUCKET, prefix),
    ]);
    return [...resumes, ...videos].sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
  } catch (error: any) {
    console.error('Error listing Amazon S3 objects:', error);
    return [];
  }
};

export const deleteS3Object = async (key: string, bucket?: string): Promise<boolean> => {
  try {
    const targetBucket = bucket || (key.startsWith('videos/') || key.startsWith('audio/')
      ? VIDEOS_BUCKET
      : RESUMES_BUCKET);
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      })
    );
    return true;
  } catch (error: any) {
    console.error(`Error deleting object ${key} from S3:`, error);
    return false;
  }
};

export const deleteS3Objects = async (
  keys: string[],
  bucket?: string
): Promise<number> => {
  if (keys.length === 0) return 0;

  const byBucket = new Map<string, string[]>();
  for (const key of keys) {
    const target =
      bucket ||
      (key.startsWith('videos/') || key.startsWith('audio/') ? VIDEOS_BUCKET : RESUMES_BUCKET);
    const list = byBucket.get(target) || [];
    list.push(key);
    byBucket.set(target, list);
  }

  let deleted = 0;
  try {
    const s3 = getS3Client();
    for (const [targetBucket, bucketKeys] of byBucket.entries()) {
      const response = await s3.send(
        new DeleteObjectsCommand({
          Bucket: targetBucket,
          Delete: {
            Objects: bucketKeys.map((k) => ({ Key: k })),
            Quiet: false,
          },
        })
      );
      deleted += response.Deleted?.length || 0;
    }
    return deleted;
  } catch (error: any) {
    console.error('Error bulk deleting S3 objects:', error);
    return deleted;
  }
};

export const extractS3KeyFromUrl = (url?: string): string | null => {
  if (!url || typeof url !== 'string') return null;

  try {
    if (url.includes('.amazonaws.com/')) {
      const parts = url.split('.amazonaws.com/');
      if (parts[1]) {
        const path = decodeURIComponent(parts[1].split('?')[0]);
        // path-style URLs include bucket as first segment
        if (url.includes('s3.') && !url.includes(`${RESUMES_BUCKET}.s3.`) && !url.includes(`${VIDEOS_BUCKET}.s3.`)) {
          const segments = path.split('/');
          if (
            segments[0] === RESUMES_BUCKET ||
            segments[0] === VIDEOS_BUCKET ||
            segments[0] === LEGACY_BUCKET
          ) {
            return segments.slice(1).join('/');
          }
        }
        return path;
      }
    }

    if (
      url.startsWith('resumes/') ||
      url.startsWith('videos/') ||
      url.startsWith('documents/') ||
      url.startsWith('images/') ||
      url.startsWith('audio/')
    ) {
      return url;
    }
  } catch (err) {
    console.error('Error parsing S3 URL key:', err);
  }

  return null;
};

export const deleteFileFromS3ByUrl = async (fileUrl?: string): Promise<boolean> => {
  if (!fileUrl) return false;
  const key = extractS3KeyFromUrl(fileUrl);
  if (!key) {
    console.warn('[S3 Delete] Could not extract valid S3 key from URL:', fileUrl);
    return false;
  }
  const bucket = bucketFromUrl(fileUrl) || undefined;
  console.log(`[S3 Delete] Deleting object key "${key}" from S3 bucket "${bucket || 'auto'}"...`);
  return await deleteS3Object(key, bucket || undefined);
};
