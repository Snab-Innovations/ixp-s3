import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Vercel Serverless Function: Secure Amazon S3 Upload
 * Runs strictly on backend (Node.js runtime).
 * Zero S3 secret keys in client browser.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { base64Data, fileName, mimeType, folder = 'documents/' } = req.body;

    if (!base64Data || !fileName) {
      return res.status(400).json({ success: false, error: 'base64Data and fileName are required.' });
    }

    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
    const region = process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-south-1';
    const bucketName = process.env.AWS_S3_BUCKET_NAME || 'interviewxpert-storage';

    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({
        success: false,
        error: 'AWS S3 credentials not configured on the server.'
      });
    }

    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const buffer = Buffer.from(base64Data.replace(/^data:.*,/, ''), 'base64');
    const key = `${folder}${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    });

    await s3Client.send(command);
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    return res.status(200).json({
      success: true,
      url: publicUrl,
      key
    });

  } catch (error) {
    console.error('[S3 Serverless Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'S3 upload failed on server.'
    });
  }
}
