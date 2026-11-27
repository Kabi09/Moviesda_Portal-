import { resolvePosterImage } from '../scraper.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.query.url || '';
  const pageUrl = req.query.pageUrl || '';
  const title = req.query.title || '';

  try {
    const result = await resolvePosterImage({ url, pageUrl, title });
    if (!result) {
      return res.status(404).end('Image Not Found');
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(result.buffer);
  } catch (err) {
    console.error('Vercel Image Proxy Error:', err);
    return res.status(500).end('Failed to load image');
  }
}
