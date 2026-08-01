import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectCommand, 
  DeleteObjectsCommand 
} from '@aws-sdk/client-s3';

const REGION = import.meta.env.VITE_AWS_S3_REGION || 'ap-south-1';
const BUCKET_NAME = import.meta.env.VITE_AWS_S3_BUCKET_NAME || 'interviewxpert-storage';
const ACCESS_KEY_ID = import.meta.env.VITE_AWS_S3_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_S3_SECRET_ACCESS_KEY || '';

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
  return Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET_NAME);
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
      const detailedError = new Error("Failed to connect to AWS S3. Please ensure CORS is enabled on your S3 bucket permissions in AWS and your AWS Region is correct.");
      throw detailedError;
    }
    throw error;
  }
};

/**
 * List all objects stored in S3 Bucket with categorization & age calculation
 */
export const listS3Objects = async (prefix?: string): Promise<S3FileItem[]> => {
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
  try {
    const s3 = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
    return true;
  } catch (error: any) {
    console.error(`Error deleting object ${key} from S3:`, error);
    return false;
  }
};

/**
 * Delete multiple files from Amazon S3
 */
export const deleteS3Objects = async (keys: string[]): Promise<number> => {
  if (keys.length === 0) return 0;
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
