import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Vercel Serverless Function: Secure Amazon S3 File Management
 * Runs strictly on backend (Node.js runtime).
 * Zero S3 secret keys in client browser.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
  const region = process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-south-1';
  const bucketName = process.env.AWS_S3_BUCKET_NAME || 'interviewxpert-storage';

  if (!accessKeyId || !secretAccessKey) {
    return res.status(200).json({
      configured: false,
      files: [],
      error: 'AWS S3 credentials not configured in server environment variables.'
    });
  }

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  // 1. GET: List S3 Objects
  if (req.method === 'GET') {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: req.query.prefix || '',
      });

      const response = await s3Client.send(command);
      const now = new Date();

      const files = (response.Contents || []).map((item) => {
        const key = item.Key || '';
        const size = item.Size || 0;
        const lastModified = item.LastModified ? new Date(item.LastModified) : now;
        const ageInDays = Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 3600 * 24));

        let category = 'Other';
        if (key.startsWith('videos/') || key.endsWith('.webm') || key.endsWith('.mp4')) {
          category = 'Video';
        } else if (key.startsWith('resumes/') || key.endsWith('.pdf') || key.endsWith('.docx')) {
          category = 'Resume';
        } else if (key.startsWith('images/') || key.endsWith('.png') || key.endsWith('.jpg')) {
          category = 'Image';
        } else if (key.startsWith('audio/') || key.endsWith('.mp3') || key.endsWith('.wav')) {
          category = 'Audio';
        }

        return {
          key,
          url: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
          size,
          lastModified: lastModified.toISOString(),
          category,
          ageInDays,
        };
      });

      return res.status(200).json({
        configured: true,
        files
      });
    } catch (err) {
      console.error('[S3 Serverless List Error]:', err);
      return res.status(500).json({ configured: true, files: [], error: err.message });
    }
  }

  // 2. POST / DELETE: Delete S3 Objects
  if (req.method === 'POST' && req.body?.action === 'delete') {
    try {
      const keys = req.body.keys;
      if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ success: false, error: 'keys array required' });
      }

      if (keys.length === 1) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: keys[0]
        }));
      } else {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: keys.map(k => ({ Key: k }))
          }
        }));
      }

      return res.status(200).json({ success: true, count: keys.length });
    } catch (err) {
      console.error('[S3 Serverless Delete Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
