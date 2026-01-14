import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { apiUrl, path, method = 'GET' } = req.query;
  const body = req.body;

  if (!apiUrl || !path) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const targetUrl = `${apiUrl}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers
      }
    };

    if (method !== 'GET' && body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Proxy error' });
  }
}
