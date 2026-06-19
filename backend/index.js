import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

// Parse .env manually for portability
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        const value = trimmed.slice(equalIndex + 1).trim();
        process.env[key] = value;
      }
    }
  }
}

const BASE_URL = process.env.BASE_URL || 'https://moviesda32.com';

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.text();
  } catch (error) {
    console.error(`Failed to fetch URL: ${url}`, error);
    throw error;
  }
}

function parseMovieElements($, matches, normQuery) {
  $('.f a').each((i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href');
    if (title && href) {
      if (title.toLowerCase().includes(normQuery)) {
        if (!matches.some(m => m.path === href)) {
          matches.push({
            title,
            path: href,
            url: href.startsWith('http') ? href : `${BASE_URL}${href}`
          });
        }
      }
    }
  });
}

// Search movies starting with the letter matching the query
async function searchMoviesAlphabetical(query) {
  const normQuery = query.toLowerCase().trim();
  if (!normQuery) return [];

  const firstChar = normQuery.charAt(0);
  let letter = 'a';
  if (/[a-z]/.test(firstChar)) {
    letter = firstChar;
  } else {
    letter = 'a';
  }

  const matches = [];
  const startUrl = `${BASE_URL}/tamil-movies/${letter}/`;
  console.error(`[Search] Querying alphabetical directory: ${startUrl}`);

  try {
    const html = await fetchPage(startUrl);
    const $ = cheerio.load(html);
    
    const totalPagesText = $('#totalPages').text().trim();
    const totalPages = parseInt(totalPagesText) || 1;
    console.error(`[Search] Total pages in '${letter}' category: ${totalPages}`);

    parseMovieElements($, matches, normQuery);

    // Fetch subsequent pages in parallel
    const promises = [];
    for (let page = 2; page <= totalPages; page++) {
      const pageUrl = `${BASE_URL}/tamil-movies/${letter}/?page=${page}`;
      promises.push((async () => {
        try {
          const pageHtml = await fetchPage(pageUrl);
          const page$ = cheerio.load(pageHtml);
          parseMovieElements(page$, matches, normQuery);
        } catch (err) {
          console.error(`Failed fetching page ${page}:`, err);
        }
      })());
    }
    await Promise.all(promises);
  } catch (error) {
    console.error(`[Search] Alphabetical search failed:`, error);
  }

  return matches;
}

// Fallback search across recent years (2026, 2025, 2024)
async function searchMoviesFallback(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  const years = ['2026', '2025', '2024'];
  console.error(`[Fallback] Querying recent year directories: ${years.join(', ')}`);

  for (const year of years) {
    const startUrl = `${BASE_URL}/tamil-${year}-movies/`;
    try {
      const html = await fetchPage(startUrl);
      const $ = cheerio.load(html);

      const totalPagesText = $('#totalPages').text().trim();
      const totalPages = parseInt(totalPagesText) || 1;

      parseMovieElements($, matches, normQuery);

      for (let page = 2; page <= Math.min(totalPages, 3); page++) {
        const pageUrl = `${BASE_URL}/tamil-${year}-movies/?page=${page}`;
        const pageHtml = await fetchPage(pageUrl);
        const page$ = cheerio.load(pageHtml);
        parseMovieElements(page$, matches, normQuery);
      }
    } catch (error) {
      console.error(`[Fallback] Failed searching directory for year ${year}:`, error);
    }
  }

  return matches;
}

// Fallback search across HD mobile movies directory (for older/number movies)
async function searchHdMovies(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  const startUrl = `${BASE_URL}/tamil-hd-movies/`;
  console.error(`[HD Search] Scanning HD movies directory: ${startUrl}`);

  try {
    const html = await fetchPage(startUrl);
    const $ = cheerio.load(html);

    const totalPagesText = $('#totalPages').text().trim();
    const totalPages = parseInt(totalPagesText) || 1;
    console.error(`[HD Search] Total pages in HD movies category: ${totalPages}`);

    parseMovieElements($, matches, normQuery);

    const promises = [];
    for (let page = 2; page <= totalPages; page++) {
      const pageUrl = `${BASE_URL}/tamil-hd-movies/?page=${page}`;
      promises.push((async () => {
        try {
          const pageHtml = await fetchPage(pageUrl);
          const page$ = cheerio.load(pageHtml);
          parseMovieElements(page$, matches, normQuery);
        } catch (err) {
          console.error(`Failed fetching HD page ${page}:`, err);
        }
      })());
    }
    await Promise.all(promises);
  } catch (error) {
    console.error(`[HD Search] HD movies search failed:`, error);
  }

  return matches;
}

// Search actor collections for movies
async function searchActorCollections(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  console.error(`[Actor Search] Scanning actor collections...`);

  try {
    const mainUrls = [
      `${BASE_URL}/tamil-movies-collection/`,
      `${BASE_URL}/tamil-movies-collection/?page=2`
    ];
    const mainHtmls = await Promise.all(mainUrls.map(url => fetchPage(url).catch(() => '')));

    const actorPaths = [];
    for (const html of mainHtmls) {
      if (!html) continue;
      const $ = cheerio.load(html);
      $('.f a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('/actor-')) {
          actorPaths.push(href);
        }
      });
    }
    console.error(`[Actor Search] Found ${actorPaths.length} actor collection folders`);

    const actorPage1Promises = actorPaths.map(async (path) => {
      const actorUrl = `${BASE_URL}${path}`;
      try {
        const html = await fetchPage(actorUrl);
        const $ = cheerio.load(html);
        parseMovieElements($, matches, normQuery);

        const totalPagesText = $('#totalPages').text().trim();
        const totalPages = parseInt(totalPagesText) || 1;
        
        if (totalPages > 1) {
          const subPromises = [];
          for (let page = 2; page <= totalPages; page++) {
            const pageUrl = `${BASE_URL}${path}?page=${page}`;
            subPromises.push((async () => {
              try {
                const subHtml = await fetchPage(pageUrl);
                const sub$ = cheerio.load(subHtml);
                parseMovieElements(sub$, matches, normQuery);
              } catch (err) {
                console.error(`Failed to fetch actor subpage ${pageUrl}:`, err);
              }
            })());
          }
          await Promise.all(subPromises);
        }
      } catch (err) {
        console.error(`Failed to fetch actor collection ${actorUrl}:`, err);
      }
    });

    await Promise.all(actorPage1Promises);

  } catch (error) {
    console.error(`[Actor Search] Actor search failed:`, error);
  }

  return matches;
}

async function searchMovies(query) {
  const normQuery = query.toLowerCase().trim();
  if (!normQuery) return [];

  console.error(`[Search] Running parallel search for '${query}' across alphabetical, actor, and year listings...`);
  
  const [alphabeticalMatches, actorMatches, fallbackMatches] = await Promise.all([
    searchMoviesAlphabetical(normQuery),
    searchActorCollections(normQuery),
    searchMoviesFallback(normQuery)
  ]);

  const matches = [...alphabeticalMatches];

  for (const match of actorMatches) {
    if (!matches.some(m => m.path === match.path)) {
      matches.push(match);
    }
  }

  for (const match of fallbackMatches) {
    if (!matches.some(m => m.path === match.path)) {
      matches.push(match);
    }
  }

  const firstChar = normQuery.charAt(0);
  if (matches.length === 0 || !/[a-z]/.test(firstChar)) {
    console.error(`[Search] Running HD movies directory search as fallback...`);
    const hdMatches = await searchHdMovies(normQuery);
    for (const match of hdMatches) {
      if (!matches.some(m => m.path === match.path)) {
        matches.push(match);
      }
    }
  }

  // Enrich top 16 matches with their poster image URL
  const topMatches = matches.slice(0, 16);
  console.error(`[Search] Enriching poster images for top ${topMatches.length} search results in parallel...`);
  const enrichedMatches = await Promise.all(
    topMatches.map(async (match) => {
      try {
        const html = await fetchPage(match.url);
        const $ = cheerio.load(html);
        const imgEl = $('#movie-info').find('picture img, img').first();
        if (imgEl.length > 0) {
          const src = imgEl.attr('src');
          if (src) {
            match.poster = src.startsWith('http') ? src : `${BASE_URL}${src}`;
          }
        }
      } catch (err) {
        console.error(`[Search] Failed to fetch poster for ${match.title}:`, err.message);
      }
      return match;
    })
  );

  return enrichedMatches;
}

// Recursively find all download links starting from a movie page path/URL
async function extractDownloadLinks(moviePath) {
  const startUrl = moviePath.startsWith('http') ? moviePath : `${BASE_URL}${moviePath}`;
  const filesList = [];
  const visited = new Set();
  let movieInfo = null;

  async function traverse(url, isStartPage = false) {
    if (visited.has(url)) return;
    visited.add(url);

    console.error(`[Crawler] Traversing: ${url}`);
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      if (isStartPage) {
        // Scrape movie info from the start page if it exists
        const infoContainer = $('#movie-info');
        if (infoContainer.length > 0) {
          movieInfo = {};
          
          // Poster image
          const imgEl = infoContainer.find('picture img, img').first();
          if (imgEl.length > 0) {
            const src = imgEl.attr('src');
            if (src) {
              movieInfo.poster = src.startsWith('http') ? src : `${BASE_URL}${src}`;
            }
          }

          // Metadata fields
          infoContainer.find('.movie-info li').each((i, el) => {
            const strongText = $(el).find('strong').text().replace(':', '').trim().toLowerCase();
            const val = $(el).find('span').text().trim();
            if (strongText && val) {
              if (strongText === 'movie') movieInfo.title = val;
              else if (strongText === 'director') movieInfo.director = val;
              else if (strongText === 'starring') movieInfo.starring = val;
              else if (strongText === 'genres') movieInfo.genres = val;
              else if (strongText === 'quality') movieInfo.quality = val;
              else if (strongText === 'language') movieInfo.language = val;
              else if (strongText === 'movie rating' || strongText.includes('rating')) movieInfo.rating = val;
              else if (strongText === 'last updated' || strongText.includes('updated')) movieInfo.lastUpdated = val;
            }
          });

          // Synopsis
          const synopsisEl = infoContainer.find('.movie-synopsis');
          if (synopsisEl.length > 0) {
            movieInfo.synopsis = synopsisEl.text().replace(/synopsis:/i, '').trim();
          }
        }
      }

      // Check if we are on a file description page (contains download server links)
      if ($('.songinfo').length > 0 || $('.dlink').length > 0) {
        console.error(`[Crawler] Found details page: ${url}`);
        let fileName = "";
        let fileSize = "";
        let duration = "";
        let resolution = "";
        let format = "";

        $('.details').each((i, el) => {
          const text = $(el).text();
          if (text.includes('File Name:')) {
            fileName = text.replace('File Name:', '').trim();
          } else if (text.includes('File Size:')) {
            fileSize = text.replace('File Size:', '').trim();
          } else if (text.includes('Duration:')) {
            duration = text.replace('Duration:', '').trim();
          } else if (text.includes('Video Resolution:')) {
            resolution = text.replace('Video Resolution:', '').trim();
          } else if (text.includes('Download Format:')) {
            format = text.replace('Download Format:', '').trim();
          }
        });

        const servers = [];
        $('.dlink a').each((i, el) => {
          const name = $(el).text().trim();
          const href = $(el).attr('href');
          if (href) {
            servers.push({ name, url: href });
          }
        });

        filesList.push({
          fileName: fileName || $('title').text().trim(),
          fileSize,
          duration,
          resolution,
          format,
          servers,
          pageUrl: url
        });
        return;
      }

      // Otherwise, extract subfolders and file links inside .f and .folder
      const linksToFollow = [];
      $('.f a, .folder a').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          const absoluteUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
          if (absoluteUrl !== BASE_URL && absoluteUrl !== BASE_URL + '/' && !absoluteUrl.includes('telegram')) {
            linksToFollow.push(absoluteUrl);
          }
        }
      });

      for (const nextUrl of linksToFollow) {
        await traverse(nextUrl);
      }

    } catch (error) {
      console.error(`[Crawler] Error traversing ${url}:`, error);
    }
  }

  await traverse(startUrl, true);
  return {
    movieInfo,
    downloads: filesList
  };
}

// MCP Server Setup
const server = new Server(
  {
    name: "moviesda-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_movies",
        description: "Search for movies on moviesda32.com by title (case-insensitive). Can search by year or alphabet.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The movie title, year, or keyword to search (e.g. '2004', 'Leo', 'Drishyam 3')."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_movie_downloads",
        description: "Recursively search and extract download details and direct server links for a specific movie path/URL.",
        inputSchema: {
          type: "object",
          properties: {
            movie_path: {
              type: "string",
              description: "The relative path (e.g. '/drishyam-3-2026-tamil-movie/') or absolute URL of the movie details page."
            }
          },
          required: ["movie_path"]
        }
      }
    ]
  };
});

// Handle Tool Executions
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    if (name === "search_movies") {
      const query = args?.query;
      if (!query) {
        throw new Error("Missing query parameter");
      }
      const results = await searchMovies(query);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }
    
    if (name === "get_movie_downloads") {
      const movie_path = args?.movie_path;
      if (!movie_path) {
        throw new Error("Missing movie_path parameter");
      }
      const results = await extractDownloadLinks(movie_path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }
    
    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start Server (Stdio or SSE depending on configuration)
async function main() {
  const transportMode = (process.env.TRANSPORT || 'stdio').toLowerCase().trim();

  if (transportMode === 'sse') {
    const PORT = parseInt(process.env.PORT) || 3000;
    let sseTransport = null;

    const httpServer = http.createServer(async (req, res) => {
      // CORS configuration
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);

      // REST API Search endpoint
      if (req.method === 'GET' && url.pathname === '/api/search') {
        const q = url.searchParams.get('q');
        if (!q) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing query parameter q' }));
          return;
        }
        try {
          const results = await searchMovies(q);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // REST API Downloads endpoint
      if (req.method === 'GET' && url.pathname === '/api/downloads') {
        const pathParam = url.searchParams.get('path');
        if (!pathParam) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }
        try {
          const results = await extractDownloadLinks(pathParam);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // MCP SSE stream endpoint
      if (req.method === 'GET' && url.pathname === '/sse') {
        sseTransport = new SSEServerTransport('/messages', res);
        await server.connect(sseTransport);
        console.error(`[SSE] Client connected to SSE stream`);
        return;
      }

      // MCP SSE message post endpoint
      if (req.method === 'POST' && url.pathname === '/messages') {
        if (!sseTransport) {
          res.writeHead(400);
          res.end('No active SSE session');
          return;
        }
        try {
          await sseTransport.handleMessage(req, res);
        } catch (err) {
          console.error('[SSE] Error handling message:', err);
          res.writeHead(500);
          res.end(err.message);
        }
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    httpServer.listen(PORT, () => {
      console.error(`[SSE] Moviesda Backend listening on http://localhost:${PORT}`);
      console.error(`[SSE] REST API Search: http://localhost:${PORT}/api/search?q=movie`);
      console.error(`[SSE] REST API Downloads: http://localhost:${PORT}/api/downloads?path=/path/`);
      console.error(`[SSE] SSE endpoint: http://localhost:${PORT}/sse`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Moviesda MCP Server running on stdio transport.");
  }
}

main().catch((error) => {
  console.error("Fatal error in main:", error);
  process.exit(1);
});
