import { getActiveDomains, updateActiveDomains } from '../scraper.js';

export default async function handler(req, res) {
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

  try {
    if (req.method === 'GET') {
      const domains = await getActiveDomains();
      return res.status(200).json(domains);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const updated = await updateActiveDomains(payload);
      return res.status(200).json(updated);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Vercel Domain API Error:', err);
    return res.status(400).json({ error: err.message });
  }
}
