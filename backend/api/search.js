import { searchMovies } from '../scraper.js';

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

  // Extract query parameter q or query
  const q = req.query.q || req.query.query;
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  try {
    const results = await searchMovies(q);
    return res.status(200).json(results);
  } catch (err) {
    console.error('Vercel Search API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
