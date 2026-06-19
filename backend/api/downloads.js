import { extractDownloadLinks } from '../scraper.js';

export default async function handler(req, res) {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract path parameter
  const path = req.query.path || req.query.movie_path;
  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const results = await extractDownloadLinks(path);
    return res.status(200).json(results);
  } catch (err) {
    console.error('Vercel Downloads API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
