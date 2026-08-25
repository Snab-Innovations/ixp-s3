import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectCommand, 
  DeleteObjectsCommand 
} from '@aws-sdk/client-s3';

const REGION = import.meta.env.VITE_AWS_S3_REGION || 'ap-south-1';
const BUCKET_NAME = import.meta.env.VITE_AWS_S3_BUCKET_NAME || 'interviewxpert-storage';

export interface S3FileItem {
  key: string;
  url: string;
  size: number;
  lastModified: Date;
  category: 'Video' | 'Resume' | 'Image' | 'Audio' | 'Other';
  ageInDays: number;
}

// Get configured AWS S3 Client instance
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
  return true; // Supported via secure backend serverless endpoint
};

/**
 * Upload blob/file directly to Amazon S3 Bucket
 */
export const uploadToS3 = async (
  blob: Blob | File,
  resourceType: 'video' | 'image' | 'auto' | 'raw' = 'auto',
  customFileName?: string
): Promise<string> => {
  if (!isS3Configured()) {
    console.warn("AWS S3 credentials missing. Check VITE_AWS_S3_ACCESS_KEY_ID & VITE_AWS_S3_SECRET_ACCESS_KEY in .env");
  }

  const mimeType = blob.type || (resourceType === 'video' ? 'video/webm' : 'application/pdf');
  let folder = 'documents/';
  
  if (resourceType === 'video' || mimeType.startsWith('video/')) {
    folder = 'videos/';
  } else if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('officedocument') || mimeType.includes('text') || resourceType === 'raw' || (blob as File).name?.match(/\.(pdf|docx?|txt)$/i)) {
    folder = 'resumes/';
  } else if (mimeType.startsWith('image/')) {
    folder = 'images/';
  } else if (mimeType.startsWith('audio/')) {
    folder = 'audio/';
  }

  const fileExtension = mimeType.split('/')[1]?.split(';')[0] || (resourceType === 'video' ? 'webm' : 'pdf');
  const baseName = customFileName || (blob as File).name || `file_${Date.now()}.${fileExtension}`;
  const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${folder}${Date.now()}_${cleanName}`;

  // 1. Try secure Serverless S3 Uploader (zero client secrets)
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const endpoint = apiBase ? `${apiBase}/api/upload-s3` : '/api/upload-s3';

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data,
        fileName: cleanName,
        mimeType,
        folder
      })
    });

    const data = await resp.json().catch(() => null);

    if (resp.ok && data?.url) {
      console.log("✅ Uploaded successfully via Serverless S3:", data.url);
      return data.url;
    }

    if (data?.error) {
      throw new Error(data.error);
    }
  } catch (serverlessErr: any) {
    if (serverlessErr.message && !serverlessErr.message.includes('fetch')) {
      throw serverlessErr;
    }
    // If serverless endpoint is not reachable, fallback only if client credentials configured
  }

  // 2. Direct AWS S3 Client Fallback (only if client credentials explicitly configured)
  if (ACCESS_KEY_ID && SECRET_ACCESS_KEY) {
    try {
      const s3 = getS3Client();
      const arrayBuffer = await blob.arrayBuffer();
      
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: mimeType,
      });

      await s3.send(command);
      
      // Construct public S3 Object URL
      const publicUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
      console.log("Uploaded successfully to Amazon S3 folder:", publicUrl);
      return publicUrl;
    } catch (error: any) {
      console.error("Amazon S3 Upload Error:", error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error("Failed to connect to AWS S3. Please ensure CORS is enabled on your S3 bucket permissions in AWS and your AWS Region is correct.");
      }
      throw error;
    }
  }

  throw new Error("S3 Upload failed: Serverless upload endpoint unavailable.");
};


/**
 * List all objects stored in S3 Bucket with categorization & age calculation
 */
export const listS3Objects = async (prefix?: string): Promise<S3FileItem[]> => {
  // 1. Try secure Serverless S3 Manager (zero client secrets)
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const endpoint = apiBase ? `${apiBase}/api/s3-manage` : '/api/s3-manage';

    const resp = await fetch(prefix ? `${endpoint}?prefix=${encodeURIComponent(prefix)}` : endpoint);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.files)) {
        return data.files.map((f: any) => ({
          ...f,
          lastModified: new Date(f.lastModified)
        }));
      }
    }
  } catch (serverlessErr) {
    // Fallback to direct client if configured
  }

  // 2. Direct AWS S3 Client Fallback
  try {
    const s3 = getS3Client();
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix || '',
    });

    const response = await s3.send(command);
    if (!response.Contents) return [];

    const now = new Date();

    return response.Contents.map((obj) => {
      const key = obj.Key || '';
      const lastModified = obj.LastModified || new Date();
      const ageInDays = Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 3600 * 24));
      const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
      
      let category: S3FileItem['category'] = 'Other';
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('videos/') || lowerKey.includes('video') || lowerKey.endsWith('.webm') || lowerKey.endsWith('.mp4') || lowerKey.endsWith('.mov')) {
        category = 'Video';
      } else if (lowerKey.startsWith('resumes/') || lowerKey.includes('resume') || lowerKey.endsWith('.pdf') || lowerKey.endsWith('.docx') || lowerKey.endsWith('.doc') || lowerKey.endsWith('.txt')) {
        category = 'Resume';
      } else if (lowerKey.startsWith('images/') || lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg') || lowerKey.endsWith('.png') || lowerKey.endsWith('.svg')) {
        category = 'Image';
      } else if (lowerKey.startsWith('audio/') || lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav') || lowerKey.endsWith('.ogg')) {
        category = 'Audio';
      }

      return {
        key,
        url,
        size: obj.Size || 0,
        lastModified,
        category,
        ageInDays,
      };
    });
  } catch (error: any) {
    console.error("Error listing Amazon S3 objects:", error);
    return [];
  }
};

/**
 * Delete a single file from Amazon S3
 */
export const deleteS3Object = async (key: string): Promise<boolean> => {
  return (await deleteS3Objects([key])) > 0;
};

/**
 * Delete multiple files from Amazon S3
 */
export const deleteS3Objects = async (keys: string[]): Promise<number> => {
  if (keys.length === 0) return 0;

  // 1. Try secure Serverless S3 Manager
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const endpoint = apiBase ? `${apiBase}/api/s3-manage` : '/api/s3-manage';

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', keys })
    });

    if (resp.ok) {
      const data = await resp.json();
      return data?.count || keys.length;
    }
  } catch (serverlessErr) {
    // Fallback to client
  }

  // 2. Direct AWS S3 Client Fallback
  try {
    const s3 = getS3Client();
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: keys.map(k => ({ Key: k })),
        Quiet: false,
      },
    });
    const response = await s3.send(command);
    return response.Deleted ? response.Deleted.length : 0;
  } catch (error: any) {
    console.error("Error bulk deleting S3 objects:", error);
    return 0;
  }
};
/**
 * Extract S3 Object Key from a full Amazon S3 URL
 */
export const extractS3KeyFromUrl = (url?: string): string | null => {
  if (!url || typeof url !== 'string') return null;

  try {
    // Pattern 1: https://bucket-name.s3.region.amazonaws.com/key/path
    if (url.includes('.amazonaws.com/')) {
      const parts = url.split('.amazonaws.com/');
      if (parts[1]) {
        return decodeURIComponent(parts[1].split('?')[0]);
      }
    }

    // Pattern 2: https://s3.region.amazonaws.com/bucket-name/key/path
    if (url.includes('s3.') && url.includes('.com/')) {
      const afterDomain = url.split('.com/')[1];
      if (afterDomain) {
        const segments = afterDomain.split('/');
        if (segments[0] === BUCKET_NAME) {
          return decodeURIComponent(segments.slice(1).join('/').split('?')[0]);
        }
        return decodeURIComponent(afterDomain.split('?')[0]);
      }
    }

    // Pattern 3: Direct key (e.g. resumes/123_abc.pdf)
    if (url.startsWith('resumes/') || url.startsWith('videos/') || url.startsWith('documents/') || url.startsWith('images/')) {
      return url;
    }
  } catch (err) {
    console.error("Error parsing S3 URL key:", err);
  }

  return null;
};

/**
 * Delete a file from Amazon S3 by URL or Key
 */
export const deleteFileFromS3ByUrl = async (fileUrl?: string): Promise<boolean> => {
  if (!fileUrl) return false;
  const key = extractS3KeyFromUrl(fileUrl);
  if (!key) {
    console.warn("[S3 Delete] Could not extract valid S3 key from URL:", fileUrl);
    return false;
  }
  console.log(`[S3 Delete] Deleting object key "${key}" from S3 Bucket "${BUCKET_NAME}"...`);
  return await deleteS3Object(key);
};

