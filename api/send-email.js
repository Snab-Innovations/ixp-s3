import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Vercel Serverless Function: Secure Amazon SES Email Dispatcher
 * Runs strictly on backend (Node.js runtime).
 * Credentials (AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY) are NEVER sent to or visible in client browsers.
 */
export default async function handler(req, res) {
  // Set CORS headers so frontend can call this function
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
    const { recipientEmail, recipientName, subject, htmlContent } = req.body;

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid recipientEmail is required.' });
    }

    if (!subject || !htmlContent) {
      return res.status(400).json({ success: false, error: 'Subject and htmlContent are required.' });
    }

    // Read server-only environment variables (without VITE_ prefix)
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';
    const fromEmail = process.env.SES_FROM_EMAIL || 'info@interviewxpert.in';
    const senderName = process.env.SES_SENDER_NAME || 'InterviewXpert';

    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({
        success: false,
        error: 'AWS SES credentials not configured on the server. Please set AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY in environment variables.'
      });
    }

    const sesClient = new SESv2Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const formattedSender = senderName ? `${senderName} <${fromEmail}>` : fromEmail;

    const command = new SendEmailCommand({
      FromEmailAddress: formattedSender,
      Destination: {
        ToAddresses: [recipientEmail.trim()],
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
      },
    });

    const response = await sesClient.send(command);
    console.log(`[SES Serverless] Successfully sent email to ${recipientEmail}, MessageId: ${response.MessageId}`);

    return res.status(200).json({
      success: true,
      messageId: response.MessageId
    });

  } catch (error) {
    console.error('[SES Serverless Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Amazon SES email delivery failed on server.'
    });
  }
}
