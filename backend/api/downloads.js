import { extractDownloadLinks } from '../scraper.js';

export default async function handler(req, res) {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract path parameter
  const path = req.query.path || req.query.movie_path;
  const category = req.query.category || '';
  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const results = await Promise.race([
      extractDownloadLinks(path, category),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Server Error: Request timed out after 15 seconds')), 15000)
      )
    ]);
    return res.status(200).json(results);
  } catch (err) {
    console.error('Vercel Downloads API Error:', err);
    return res.status(500).json({ error: err.message || 'Server Error' });
  }
}
