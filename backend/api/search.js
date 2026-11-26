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

  // Extract query parameter q or query (default to 'latest')
  const q = req.query.q || req.query.query || 'latest';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const type = req.query.type || 'name';

  try {
    const results = await searchMovies(q, page, limit, type);
    return res.status(200).json(results);
  } catch (err) {
    console.error('Vercel Search API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
