import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

/**
 * Vercel Serverless Function: Amazon Polly Speech Synthesis
 * Endpoint: POST /api/tts-polly
 * Payload:
 * - VoiceId: Aditi
 * - Engine: standard
 * - LanguageCode: hi-IN or en-IN
 * - OutputFormat: mp3
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
    const { text, lang = 'hi-IN' } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Parameter text is required.' });
    }

    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || process.env.VITE_AWS_S3_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_S3_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
    const region = process.env.AWS_POLLY_REGION || process.env.AWS_REGION || process.env.AWS_S3_REGION || process.env.VITE_AWS_S3_REGION || 'ap-south-1';

    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({
        success: false,
        error: 'AWS credentials not configured on server environment.'
      });
    }

    const pollyClient = new PollyClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const isHindi = /[\u0900-\u097F]/.test(text) || (lang || '').toLowerCase().startsWith('hi') || (lang || '').toLowerCase().startsWith('mr');
    const languageCode = isHindi ? 'hi-IN' : 'en-IN';

    // AWS Polly Payload with exact requested specs
    const command = new SynthesizeSpeechCommand({
      Engine: 'standard',
      LanguageCode: languageCode,
      OutputFormat: 'mp3',
      Text: text.trim(),
      VoiceId: 'Aditi',
    });

    const response = await pollyClient.send(command);

    if (!response.AudioStream) {
      return res.status(500).json({ success: false, error: 'AWS Polly returned empty audio stream.' });
    }

    const audioBytes = await response.AudioStream.transformToByteArray();
    const audioBuffer = Buffer.from(audioBytes);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('[AWS Polly Endpoint Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'AWS Polly speech synthesis failed on server.'
    });
  }
}
