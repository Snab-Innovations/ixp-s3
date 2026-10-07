/**
 * Vercel Serverless Function: AssemblyAI Streaming Temporary Token Issuer
 * Endpoint: GET or POST /api/assemblyai-token
 * 
 * Securely fetches a temporary streaming token from AssemblyAI v3 so browsers
 * can connect directly to wss://streaming.assemblyai.com/v3/ws without exposing
 * the API key or hitting browser CORS preflight restrictions.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const apiKey = (
      process.env.VITE_ASSEMBLYAI_API_KEY ||
      process.env.ASSEMBLYAI_API_KEY ||
      '4a07d7f7399f447b9ff969c458df945f'
    ).trim();

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'AssemblyAI API key not configured on server.'
      });
    }

    const expiresIn = 600; // 10 minutes
    const response = await fetch(`https://streaming.assemblyai.com/v3/token?expires_in_seconds=${expiresIn}`, {
      method: 'GET',
      headers: {
        Authorization: apiKey
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AssemblyAI Token Error]:', response.status, errText);
      return res.status(response.status).json({
        success: false,
        error: `AssemblyAI upstream error: ${response.status} - ${errText}`
      });
    }

    const data = await response.json();
    return res.status(200).json({
      success: true,
      token: data.token,
      expires_in_seconds: data.expires_in_seconds || expiresIn
    });
  } catch (error) {
    console.error('[AssemblyAI Token Handler Exception]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AssemblyAI streaming token.'
    });
  }
}
