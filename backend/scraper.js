import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Ensure .env is loaded before reading BASE_URL (ES module imports are hoisted)
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
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

export let BASE_URL = (process.env.BASE_URL || 'https://moviesda36.com').replace(/\/+$/, '');
export let DUBBED_BASE_URL = (process.env.DUBBED_BASE_URL || 'https://isaidub.green').replace(/\/+$/, '');

const CLOUD_CONFIG_URL =
  process.env.CLOUD_CONFIG_URL ||
  'https://api.restful-api.dev/objects/ff808181a09d98f701a21793643554a5';

let lastCloudSyncAt = 0;
const CLOUD_SYNC_TTL_MS = 60 * 1000; // Check cloud store at most once per 60s per instance

export async function ensureDomainsSynced(force = false) {
  const now = Date.now();
  if (!force && now - lastCloudSyncAt < CLOUD_SYNC_TTL_MS) {
    return { baseUrl: BASE_URL, dubbedBaseUrl: DUBBED_BASE_URL };
  }
  lastCloudSyncAt = now;

  try {
    const res = await fetch(CLOUD_CONFIG_URL, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const json = await res.json();
      const cloudBase = json?.data?.baseUrl?.trim()?.replace(/\/+$/, '');
      const cloudDubbed = json?.data?.dubbedBaseUrl?.trim()?.replace(/\/+$/, '');
      if (cloudBase && /^https?:\/\//i.test(cloudBase)) {
        BASE_URL = cloudBase;
        process.env.BASE_URL = cloudBase;
      }
      if (cloudDubbed && /^https?:\/\//i.test(cloudDubbed)) {
        DUBBED_BASE_URL = cloudDubbed;
        process.env.DUBBED_BASE_URL = cloudDubbed;
      }
    }
  } catch (err) {
    console.error('[Domain Sync] Cloud config fetch warning:', err.message);
  }

  return { baseUrl: BASE_URL, dubbedBaseUrl: DUBBED_BASE_URL };
}

export async function getActiveDomains() {
  return ensureDomainsSynced(true);
}

export async function updateActiveDomains({ baseUrl, dubbedBaseUrl }) {
  const cleanBase = (baseUrl || BASE_URL).trim().replace(/\/+$/, '');
  const cleanDubbed = (dubbedBaseUrl || DUBBED_BASE_URL).trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(cleanBase) || !/^https?:\/\//i.test(cleanDubbed)) {
    throw new Error('Both URLs must start with http:// or https://');
  }

  BASE_URL = cleanBase;
  DUBBED_BASE_URL = cleanDubbed;
  process.env.BASE_URL = cleanBase;
  process.env.DUBBED_BASE_URL = cleanDubbed;
  cachedActorsList = null;
  lastCloudSyncAt = Date.now();

  // 1. Persist globally to Cloud Store (works across all Vercel Serverless instances)
  try {
    await fetch(CLOUD_CONFIG_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'moviesda-domains-config',
        data: {
          baseUrl: cleanBase,
          dubbedBaseUrl: cleanDubbed,
          updatedAt: new Date().toISOString()
        }
      })
    });
  } catch (err) {
    console.error('[Domain Update] Cloud store update warning:', err.message);
  }

  // 2. Also update local backend/.env if filesystem is writable
  try {
    if (fs.existsSync(envPath)) {
      let envText = fs.readFileSync(envPath, 'utf8');
      if (/^BASE_URL=/m.test(envText)) {
        envText = envText.replace(/^BASE_URL=.*$/m, `BASE_URL=${cleanBase}`);
      } else {
        envText += `\nBASE_URL=${cleanBase}`;
      }
      if (/^DUBBED_BASE_URL=/m.test(envText)) {
        envText = envText.replace(/^DUBBED_BASE_URL=.*$/m, `DUBBED_BASE_URL=${cleanDubbed}`);
      } else {
        envText += `\nDUBBED_BASE_URL=${cleanDubbed}`;
      }
      fs.writeFileSync(envPath, envText, 'utf8');
    }
  } catch (err) {
    // Ignore read-only filesystem on Vercel serverless
  }

  return { baseUrl: BASE_URL, dubbedBaseUrl: DUBBED_BASE_URL };
}

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

function stripYearFromTitle(title) {
  return title.replace(/\s*\(\d{4}\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractYearFromTitle(title) {
  const m = title.match(/\((\d{4})\)/);
  return m ? m[1] : '';
}

function derivePosterFromPath(href, isDubbed = false) {
  if (!href || isDubbed) return undefined;
  const slug = href.replace(/^\/+|\/+$/g, '');
  const cleanSlug = slug
    .replace(/-(?:tamil-)?(?:movie|web-series)(?:-moviesda)?(?:-download)?$/i, '')
    .replace(/-moviesda$/i, '');
  if (!cleanSlug) return undefined;
  return `${BASE_URL}/uploads/posters/${cleanSlug}.jpg`;
}

function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[-_.:,'"!()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\s\-_.:,'"!()[\]]+/g, '');
}

const IGNORED_LINK_TEXTS = new Set(['sms', 'facebook', 'twitter', 'whatsapp', 'home', 'contact us', 'dmca', 'dmca policy', 'isaidub home', 'moviesda home', 'disclaimer']);

function parseMovieElements($, matches, normQuery = '', searchType = 'name', siteBaseUrl = BASE_URL, isDubbed = false) {
  const cleanQuerySpaced = normalizeForMatch(normQuery);
  const cleanQueryCompact = compactForMatch(normQuery);

  $('.f a, .folder a').each((i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href');
    if (title && href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('sms:') && !href.startsWith('whatsapp:')) {
      if (/^\(.*\)$/.test(title)) return;
      if (IGNORED_LINK_TEXTS.has(title.toLowerCase())) return;
      if (href === '/' || href.includes('/download/page/')) return;

      let isMatch = false;
      if (!normQuery) {
        isMatch = true;
      } else if (searchType === 'year') {
        const yearInTitle = extractYearFromTitle(title);
        isMatch = yearInTitle === normQuery || (normQuery.length === 2 && yearInTitle.endsWith(normQuery));
      } else {
        // Movie Name / Collection / Webseries search: strip the (YYYY) release year so numbers like 96, 24, 29 don't match release years
        const titleWithoutYear = stripYearFromTitle(title);
        const movieSpaced = normalizeForMatch(titleWithoutYear);
        const movieCompact = compactForMatch(titleWithoutYear);

        if (/^\d+$/.test(normQuery)) {
          const numRegex = new RegExp(`(^|[^0-9])${normQuery}([^0-9]|$)`);
          isMatch = numRegex.test(movieSpaced);
        } else {
          // Match both spaced ("spider man" / "spider-man") and compact ("spiderman") forms
          isMatch =
            (cleanQuerySpaced && movieSpaced.includes(cleanQuerySpaced)) ||
            (cleanQueryCompact.length >= 3 && movieCompact.includes(cleanQueryCompact));
        }
      }

      if (isMatch) {
        if (!matches.some(m => m.path === href)) {
          matches.push({
            title,
            path: href,
            url: href.startsWith('http') ? href : `${siteBaseUrl}${href}`,
            poster: derivePosterFromPath(href, isDubbed),
            category: isDubbed ? 'dubbed' : 'tamil'
          });
        }
      }
    }
  });
}

async function enrichPosters(movieList, maxScraped = 30) {
  const toScrape = movieList.slice(0, maxScraped);
  console.error(`[Search] Enriching exact poster images for ${toScrape.length} of ${movieList.length} movies in parallel...`);
  await Promise.all(
    toScrape.map(async (match) => {
      try {
        const html = await fetchPage(match.url);
        const $ = cheerio.load(html);
        const imgEl = $('#movie-info').find('picture img, img').first();
        const src = imgEl.length > 0 ? imgEl.attr('src') : '';
        if (src) {
          match.poster = src.startsWith('http') ? src : `${BASE_URL}${src}`;
        } else {
          // Page has no poster on moviesda; try IMDb poster lookup instead of keeping a 404 derived slug URL
          const imdbPoster = await fetchImdbPoster(match.title);
          match.poster = imdbPoster || undefined;
        }
      } catch (err) {
        console.error(`[Search] Failed to fetch poster for ${match.title}:`, err.message);
      }
      return match;
    })
  );
  return movieList;
}

const IMAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
};

async function tryFetchImageBytes(imgUrl) {
  if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) return null;
  try {
    const res = await fetch(imgUrl, { headers: IMAGE_HEADERS });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const arrayBuf = await res.arrayBuffer();
    if (!arrayBuf || arrayBuf.byteLength < 200) return null;
    return {
      buffer: Buffer.from(arrayBuf),
      contentType
    };
  } catch (err) {
    return null;
  }
}

// Resolve and proxy poster image bytes (bypasses mobile/laptop ISP blocks on moviesda and recovers 404 derived poster slugs)
export async function resolvePosterImage({ url = '', pageUrl = '', title = '' }) {
  await ensureDomainsSynced();

  // 1. Try fetching the provided poster URL directly from the backend
  if (url) {
    const directImg = await tryFetchImageBytes(url);
    if (directImg) return directImg;
  }

  // 2. If direct URL 404'd (e.g. derived slug mismatch), scrape the actual movie page for #movie-info img
  if (pageUrl && /^https?:\/\//i.test(pageUrl)) {
    try {
      const html = await fetchPage(pageUrl);
      const $ = cheerio.load(html);
      const src =
        $('#movie-info').find('picture img, img').first().attr('src') ||
        $('.albumcover img, .tblimg img').first().attr('src');
      if (src) {
        const origin = new URL(pageUrl).origin;
        const resolvedSrc = src.startsWith('http') ? src : `${origin}${src}`;
        if (resolvedSrc !== url) {
          const pageImg = await tryFetchImageBytes(resolvedSrc);
          if (pageImg) return pageImg;
        }
      }
    } catch (err) {
      // Fall through to IMDb poster lookup
    }
  }

  // 3. Fallback to IMDb poster lookup by title
  if (title) {
    const imdbUrl = await fetchImdbPoster(title);
    if (imdbUrl && imdbUrl !== url) {
      const imdbImg = await tryFetchImageBytes(imdbUrl);
      if (imdbImg) return imdbImg;
    }
  }

  return null;
}

// Fetch ALL movies across all pages of a specific directory path (e.g. '/tamil-2026-movies/' or '/actor-vijay-movies-collection/')
async function fetchDirectoryMoviesPaginated(dirPath, _page = 1, _limit = 0, extraFields = {}) {
  const normalizedPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
  const baseDirUrl = `${BASE_URL}${normalizedPath}`;
  console.error(`[Directory All] Fetching all pages of ${baseDirUrl}`);

  try {
    const firstHtml = await fetchPage(baseDirUrl);
    const $first = cheerio.load(firstHtml);

    const totalSitePages = parseInt($first('#totalPages').text().trim()) || 1;
    const collected = [];
    parseMovieElements($first, collected, '');

    if (totalSitePages > 1) {
      const pageNumbers = Array.from({ length: totalSitePages - 1 }, (_, i) => i + 2);
      const pageHtmls = await Promise.all(
        pageNumbers.map(sp =>
          fetchPage(`${baseDirUrl}?page=${sp}`).catch(err => {
            console.error(`[Directory All] Failed fetching site page ${sp}:`, err.message);
            return '';
          })
        )
      );
      for (const spHtml of pageHtmls) {
        if (spHtml) {
          const $sp = cheerio.load(spHtml);
          parseMovieElements($sp, collected, '');
        }
      }
    }

    await enrichPosters(collected, 30);

    return {
      movies: collected,
      page: 1,
      limit: collected.length,
      totalPages: 1,
      total: collected.length,
      hasMore: false,
      baseUrl: BASE_URL,
      ...extraFields
    };
  } catch (error) {
    console.error(`[Directory All] Failed fetching ${dirPath}:`, error);
    return { movies: [], page: 1, limit: 0, totalPages: 1, total: 0, hasMore: false, baseUrl: BASE_URL, ...extraFields };
  }
}

// Fast paginated fetch for a specific year directory (e.g. 2026) or latest movies
async function fetchYearMoviesPaginated(year, page = 1, limit = 15) {
  return fetchDirectoryMoviesPaginated(`/tamil-${year}-movies/`, page, limit);
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

// Fallback search across year directories
async function searchMoviesFallback(query, years = ['2026', '2025', '2024'], maxPagesPerYear = 5, searchType = 'name') {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  console.error(`[Fallback] Querying year directories (${years.join(', ')})...`);

  await Promise.all(
    years.map(async (year) => {
      const startUrl = `${BASE_URL}/tamil-${year}-movies/`;
      try {
        const html = await fetchPage(startUrl);
        const $ = cheerio.load(html);

        const totalPagesText = $('#totalPages').text().trim();
        const totalPages = parseInt(totalPagesText) || 1;
        const limitPages = maxPagesPerYear ? Math.min(totalPages, maxPagesPerYear) : totalPages;

        parseMovieElements($, matches, normQuery, searchType);

        const pagePromises = [];
        for (let page = 2; page <= limitPages; page++) {
          const pageUrl = `${BASE_URL}/tamil-${year}-movies/?page=${page}`;
          pagePromises.push(
            (async () => {
              try {
                const pageHtml = await fetchPage(pageUrl);
                const page$ = cheerio.load(pageHtml);
                parseMovieElements(page$, matches, normQuery, searchType);
              } catch (err) {
                console.error(`[Fallback] Failed year ${year} page ${page}:`, err.message);
              }
            })()
          );
        }
        await Promise.all(pagePromises);
      } catch (error) {
        console.error(`[Fallback] Failed searching directory for year ${year}:`, error.message);
      }
    })
  );

  return matches;
}

// Fallback search across HD mobile movies directory
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

const ALL_YEAR_DIRS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2012'];
const DUBBED_YEAR_DIRS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015'];

const dubbedPosterCache = new Map();

function cleanTitleForPosterLookup(rawTitle) {
  return (rawTitle || '')
    .replace(/\s*\b(?:triology|trilogy|duology|quadrilogy|pentalogy|hexalogy|anthology|complete|dubbed|tamil|movie|movies|web\s*series|collections?)\b\s*/gi, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchImdbPoster(title) {
  if (!title) return undefined;
  const cleanWithYear = cleanTitleForPosterLookup(title);
  if (!cleanWithYear) return undefined;

  if (dubbedPosterCache.has(cleanWithYear)) {
    return dubbedPosterCache.get(cleanWithYear) || undefined;
  }

  const queryVariants = [cleanWithYear];
  const withoutYear = cleanWithYear.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  if (withoutYear && withoutYear !== cleanWithYear) {
    queryVariants.push(withoutYear);
  }

  for (const q of queryVariants) {
    try {
      const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
        const itemWithImg = data?.d?.find((item) => item?.i?.imageUrl);
        if (itemWithImg?.i?.imageUrl) {
          const posterUrl = itemWithImg.i.imageUrl.replace(/\._V1_.*\.jpg$/i, '._V1_QL75_UX380_.jpg');
          dubbedPosterCache.set(cleanWithYear, posterUrl);
          return posterUrl;
        }
      }
    } catch (err) {
      // Ignore individual poster lookup failure
    }
  }

  dubbedPosterCache.set(cleanWithYear, null);
  return undefined;
}

async function enrichDubbedPosters(movieList, concurrency = 45) {
  if (!movieList || movieList.length === 0) return movieList;

  // First attach any cached posters immediately
  const uncached = [];
  for (const movie of movieList) {
    if (movie.poster) continue;
    const key = cleanTitleForPosterLookup(movie.title);
    if (dubbedPosterCache.has(key)) {
      const cached = dubbedPosterCache.get(key);
      if (cached) movie.poster = cached;
    } else {
      uncached.push(movie);
    }
  }

  if (uncached.length === 0) return movieList;

  console.error(`[Dubbed Posters] Fetching posters for ${uncached.length} dubbed titles (concurrency ${concurrency})...`);
  for (let i = 0; i < uncached.length; i += concurrency) {
    const batch = uncached.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (movie) => {
        const poster = await fetchImdbPoster(movie.title);
        if (poster) {
          movie.poster = poster;
        }
      })
    );
  }

  return movieList;
}

// Fetch all pages of an isaidub.green directory (supports ?get-page=N and /tamil-atoz-dubbed-movies/<letter>/<page>)
async function fetchDubbedDirectoryPages(dirPath, normQuery = '', searchType = 'name', maxPages = 0) {
  const normalizedPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
  const baseDirUrl = `${DUBBED_BASE_URL}${normalizedPath}`;
  const isAtoZ = normalizedPath.includes('/tamil-atoz-dubbed-movies/');
  const collected = [];

  try {
    const firstHtml = await fetchPage(baseDirUrl);
    const $first = cheerio.load(firstHtml);
    let totalSitePages = parseInt($first('#totalPages').text().trim()) || 1;
    if (totalSitePages <= 1) {
      $first('.pagination a, .pgn a').each((i, el) => {
        const num = parseInt($first(el).text().trim());
        if (!isNaN(num) && num > totalSitePages) totalSitePages = num;
      });
    }

    const pagesToFetch = maxPages > 0 ? Math.min(totalSitePages, maxPages) : totalSitePages;
    parseMovieElements($first, collected, normQuery, searchType, DUBBED_BASE_URL, true);

    if (pagesToFetch > 1) {
      const pageNumbers = Array.from({ length: pagesToFetch - 1 }, (_, i) => i + 2);
      const pageHtmls = await Promise.all(
        pageNumbers.map((sp) => {
          const pageUrl = isAtoZ
            ? `${baseDirUrl.replace(/\/+$/, '')}/${sp}`
            : `${baseDirUrl}?get-page=${sp}`;
          return fetchPage(pageUrl).catch(() => '');
        })
      );
      for (const spHtml of pageHtmls) {
        if (spHtml) {
          const $sp = cheerio.load(spHtml);
          parseMovieElements($sp, collected, normQuery, searchType, DUBBED_BASE_URL, true);
        }
      }
    }
  } catch (err) {
    console.error(`[Dubbed Directory] Failed fetching ${baseDirUrl}:`, err.message);
  }

  return collected;
}

// Fast 25-per-page pagination for Latest Movies (supports both Tamil and Hollywood/Dubbed)
async function fetchLatestMoviesPaginated(isDubbed = false, page = 1, limit = 25) {
  const ITEMS_PER_SITE_PAGE = 20;
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.max(1, parseInt(limit) || 25);
  const startIndex = (safePage - 1) * safeLimit;
  const endIndex = safePage * safeLimit;
  const sitePageStart = Math.floor(startIndex / ITEMS_PER_SITE_PAGE) + 1;
  const sitePageEnd = Math.floor((endIndex - 1) / ITEMS_PER_SITE_PAGE) + 1;

  const siteBase = isDubbed ? DUBBED_BASE_URL : BASE_URL;
  const dirPath = isDubbed ? '/tamil-2026-dubbed-movies/' : '/tamil-2026-movies/';
  const pageParam = isDubbed ? 'get-page' : 'page';
  const baseDirUrl = `${siteBase}${dirPath}`;

  try {
    const firstSiteUrl = sitePageStart === 1 ? baseDirUrl : `${baseDirUrl}?${pageParam}=${sitePageStart}`;
    const firstHtml = await fetchPage(firstSiteUrl);
    const $first = cheerio.load(firstHtml);

    let totalSitePages = parseInt($first('#totalPages').text().trim()) || 1;
    if (totalSitePages <= 1) {
      $first('.pagination a, .pgn a').each((i, el) => {
        const num = parseInt($first(el).text().trim());
        if (!isNaN(num) && num > totalSitePages) totalSitePages = num;
      });
    }

    const totalUiPages = Math.max(1, Math.ceil((totalSitePages * ITEMS_PER_SITE_PAGE) / safeLimit));
    if (sitePageStart > totalSitePages) {
      return {
        movies: [],
        page: safePage,
        limit: safeLimit,
        totalPages: totalUiPages,
        total: totalSitePages * ITEMS_PER_SITE_PAGE,
        hasMore: false,
        baseUrl: siteBase,
        category: isDubbed ? 'dubbed' : 'tamil'
      };
    }

    const collected = [];
    parseMovieElements($first, collected, '', 'name', siteBase, isDubbed);

    if (sitePageEnd > sitePageStart) {
      const clampedEnd = Math.min(sitePageEnd, totalSitePages);
      for (let sp = sitePageStart + 1; sp <= clampedEnd; sp++) {
        const spHtml = await fetchPage(`${baseDirUrl}?${pageParam}=${sp}`).catch(() => '');
        if (spHtml) {
          parseMovieElements(cheerio.load(spHtml), collected, '', 'name', siteBase, isDubbed);
        }
      }
    }

    const localOffset = startIndex - (sitePageStart - 1) * ITEMS_PER_SITE_PAGE;
    const pageSlice = collected.slice(localOffset, localOffset + safeLimit);

    if (isDubbed) {
      await enrichDubbedPosters(pageSlice);
    } else {
      await enrichPosters(pageSlice, safeLimit);
    }

    const hasMore = sitePageEnd < totalSitePages || localOffset + safeLimit < collected.length;

    return {
      movies: pageSlice,
      page: safePage,
      limit: safeLimit,
      totalPages: totalUiPages,
      total: totalSitePages * ITEMS_PER_SITE_PAGE,
      hasMore,
      baseUrl: siteBase,
      category: isDubbed ? 'dubbed' : 'tamil'
    };
  } catch (err) {
    console.error(`[Latest Paginated] Error fetching latest movies:`, err.message);
    return {
      movies: [],
      page: safePage,
      limit: safeLimit,
      totalPages: 1,
      total: 0,
      hasMore: false,
      baseUrl: siteBase,
      category: isDubbed ? 'dubbed' : 'tamil'
    };
  }
}

export async function searchDubbedMovies(query, searchType = 'name', page = 1, limit = 25) {
  const normQuery = (query || '').toLowerCase().trim();
  const mode = (searchType || 'name').toLowerCase().trim();
  const filterQuery = !normQuery || normQuery === 'latest' || normQuery === 'all' ? '' : normQuery;

  console.error(`[Dubbed Search] Mode='${mode}', Query='${query}' (page ${page}) on ${DUBBED_BASE_URL}`);

  if (mode === 'webseries') {
    const series = await fetchDubbedDirectoryPages('/tamil-dubbed-web-series/', filterQuery, 'name');
    if (filterQuery) sortMovieNameMatches(series, filterQuery);
    await enrichDubbedPosters(series);
    return {
      movies: series,
      page: 1,
      limit: series.length,
      total: series.length,
      totalPages: 1,
      hasMore: false,
      baseUrl: DUBBED_BASE_URL,
      category: 'dubbed'
    };
  }

  if (mode === 'collection') {
    const collections = await fetchDubbedDirectoryPages('/movie/tamil-dubbed-movies-collections/', filterQuery, 'name');
    if (filterQuery) sortMovieNameMatches(collections, filterQuery);
    await enrichDubbedPosters(collections);
    return {
      movies: collections,
      page: 1,
      limit: collections.length,
      total: collections.length,
      totalPages: 1,
      hasMore: false,
      baseUrl: DUBBED_BASE_URL,
      category: 'dubbed'
    };
  }

  if (mode === 'year') {
    let targetYear = filterQuery || '2026';
    if (/^\d{2}$/.test(targetYear)) {
      const num = parseInt(targetYear, 10);
      targetYear = num <= 30 ? `20${targetYear}` : `19${targetYear}`;
    }

    if (DUBBED_YEAR_DIRS.includes(targetYear)) {
      const yearMovies = await fetchDubbedDirectoryPages(`/tamil-${targetYear}-dubbed-movies/`, '', 'name');
      await enrichDubbedPosters(yearMovies);
      return {
        movies: yearMovies,
        page: 1,
        limit: yearMovies.length,
        total: yearMovies.length,
        totalPages: 1,
        hasMore: false,
        baseUrl: DUBBED_BASE_URL,
        category: 'dubbed'
      };
    }

    // For older years without a dedicated directory (e.g. 2005, 1999), scan A-Z or Hollywood directory by release year
    const allHollywood = await fetchDubbedDirectoryPages('/tamil-dubbed-hollywood-movies/', targetYear, 'year');
    await enrichDubbedPosters(allHollywood);
    return {
      movies: allHollywood,
      page: 1,
      limit: allHollywood.length,
      total: allHollywood.length,
      totalPages: 1,
      hasMore: false,
      baseUrl: DUBBED_BASE_URL,
      category: 'dubbed'
    };
  }

  // Default Dubbed 'name' search: when 'latest'/empty, return 25 latest Hollywood movies per page
  if (!filterQuery) {
    return fetchLatestMoviesPaginated(true, page, limit);
  }

  const firstChar = filterQuery.charAt(0);
  const isAlphaStart = /[a-z]/.test(firstChar);
  let matches = [];

  const dirPromises = [
    ...DUBBED_YEAR_DIRS.map(yr => fetchDubbedDirectoryPages(`/tamil-${yr}-dubbed-movies/`, filterQuery, 'name')),
    fetchDubbedDirectoryPages('/movie/tamil-dubbed-movies-collections/', filterQuery, 'name'),
    fetchDubbedDirectoryPages('/tamil-dubbed-web-series/', filterQuery, 'name')
  ];

  if (isAlphaStart) {
    dirPromises.unshift(fetchDubbedDirectoryPages(`/tamil-atoz-dubbed-movies/${firstChar}`, filterQuery, 'name'));
    if (firstChar !== 't') {
      dirPromises.push(fetchDubbedDirectoryPages('/tamil-atoz-dubbed-movies/t', filterQuery, 'name'));
    }
  }

  const resultsArrays = await Promise.all(dirPromises);
  const rawMatches = resultsArrays.flat();

  // If any matched item is a Collection folder, expand its child movies so every movie in that collection appears in search results
  const collectionFolders = rawMatches.filter(
    (m) => m.path.includes('collections') || /collections?$/i.test(m.title)
  );
  if (collectionFolders.length > 0) {
    const childArrays = await Promise.all(
      collectionFolders.slice(0, 6).map((coll) =>
        fetchDubbedDirectoryPages(coll.path, '', 'name', 1)
      )
    );
    rawMatches.push(...childArrays.flat());
  }

  for (const item of rawMatches) {
    if (!matches.some(m => m.path === item.path)) {
      matches.push(item);
    }
  }

  matches = deduplicateMoviesByTitle(matches);
  sortMovieNameMatches(matches, filterQuery);
  await enrichDubbedPosters(matches);

  return {
    movies: matches,
    page: 1,
    limit: matches.length,
    total: matches.length,
    totalPages: 1,
    hasMore: false,
    baseUrl: DUBBED_BASE_URL,
    category: 'dubbed'
  };
}

let cachedActorsList = null;

const ACTOR_NAME_FIXES = {
  'dhaunsh': 'Dhanush',
  'surya': 'Suriya',
  'kamal hassan': 'Kamal Haasan'
};

const ACTOR_ALIASES = {
  'dhanush': ['dhaunsh', 'dhanush'],
  'suriya': ['surya', 'suriya'],
  'kamal haasan': ['kamal hassan', 'kamal haasan', 'kamal'],
  'vijay sethupathi': ['vijay sethupathi', 'vjs', 'sethupathi'],
  'sivakarthikeyan': ['sivakarthikeyan', 'sk'],
  'simbu': ['simbu', 'str', 'silambarasan'],
  'jayam ravi': ['jayam ravi', 'ravi', 'ravi mohan'],
  'rajinikanth': ['rajinikanth', 'rajini', 'superstar'],
  'ajith': ['ajith', 'ajith kumar', 'thala'],
  'vijay': ['vijay', 'thalapathy']
};

export async function getActorsList() {
  if (cachedActorsList && cachedActorsList.length > 0) {
    return cachedActorsList;
  }

  const mainUrls = [
    `${BASE_URL}/tamil-movies-collection/`,
    `${BASE_URL}/tamil-movies-collection/?page=2`
  ];
  const mainHtmls = await Promise.all(mainUrls.map(url => fetchPage(url).catch(() => '')));

  const actors = [];
  for (const html of mainHtmls) {
    if (!html) continue;
    const $ = cheerio.load(html);
    $('.f a').each((i, el) => {
      const fullName = $(el).text().trim();
      const href = $(el).attr('href');
      if (fullName && href && href.startsWith('/actor-')) {
        let shortName = fullName.replace(/\s*movies?\s*collections?\s*/i, '').trim();
        const lowerShort = shortName.toLowerCase();
        if (ACTOR_NAME_FIXES[lowerShort]) {
          shortName = ACTOR_NAME_FIXES[lowerShort];
        }
        if (!actors.some(a => a.path === href)) {
          actors.push({
            name: shortName,
            fullName,
            path: href
          });
        }
      }
    });
  }

  // Sort popular/alphabetical cleanly
  const priorityOrder = [
    'Vijay', 'Ajith', 'Rajinikanth', 'Kamal Haasan', 'Suriya',
    'Dhanush', 'Vijay Sethupathi', 'Sivakarthikeyan', 'Vikram',
    'Karthi', 'Simbu', 'Jayam Ravi', 'Vishal', 'Madhavan', 'Arya'
  ];
  actors.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a.name);
    const idxB = priorityOrder.indexOf(b.name);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  if (actors.length > 0) {
    cachedActorsList = actors;
  }
  return actors;
}

function findMatchingActor(actors, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q || q === 'latest' || q === 'all') {
    return actors[0] || null;
  }

  // Check exact path match first
  const byPath = actors.find(a => a.path.toLowerCase() === q || a.path.toLowerCase() === `/${q.replace(/^\/+|\/+$/g, '')}/`);
  if (byPath) return byPath;

  // Check exact short name or alias match
  for (const actor of actors) {
    const lowerName = actor.name.toLowerCase();
    const lowerFull = actor.fullName.toLowerCase();
    const aliases = ACTOR_ALIASES[lowerName] || [];
    if (lowerName === q || lowerFull === q || aliases.includes(q)) {
      return actor;
    }
  }

  // Starts-with or substring match
  return (
    actors.find(a => a.name.toLowerCase().startsWith(q)) ||
    actors.find(a => {
      const lowerName = a.name.toLowerCase();
      const aliases = ACTOR_ALIASES[lowerName] || [];
      return lowerName.includes(q) || a.fullName.toLowerCase().includes(q) || aliases.some(al => al.includes(q));
    }) ||
    null
  );
}

function sortMovieNameMatches(matches, normQuery) {
  const qCompact = compactForMatch(normQuery);
  const qSpaced = normalizeForMatch(normQuery);

  return matches.sort((a, b) => {
    const rawA = stripYearFromTitle(a.title).replace(/\s*\(movie\)\s*/gi, '').trim();
    const rawB = stripYearFromTitle(b.title).replace(/\s*\(movie\)\s*/gi, '').trim();
    const compactA = compactForMatch(rawA);
    const compactB = compactForMatch(rawB);
    const spacedA = normalizeForMatch(rawA);
    const spacedB = normalizeForMatch(rawB);

    // Put Collections folder slightly after individual movies so individual movies appear first in order
    const isCollA = /collections?$/i.test(rawA) ? 1 : 0;
    const isCollB = /collections?$/i.test(rawB) ? 1 : 0;

    const exactA = compactA === qCompact || spacedA === qSpaced ? 1 : 0;
    const exactB = compactB === qCompact || spacedB === qSpaced ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;

    const startA = compactA.startsWith(qCompact) || spacedA.startsWith(qSpaced) ? 1 : 0;
    const startB = compactB.startsWith(qCompact) || spacedB.startsWith(qSpaced) ? 1 : 0;
    if (startA !== startB) return startB - startA;

    if (isCollA !== isCollB) return isCollA - isCollB;

    return rawA.localeCompare(rawB, undefined, { numeric: true });
  });
}

function deduplicateMoviesByTitle(matches) {
  const seenKeys = new Set();
  const result = [];
  for (const m of matches) {
    const year = extractYearFromTitle(m.title);
    const cleanKey = `${compactForMatch(stripYearFromTitle(m.title))}_${year}`;
    if (!seenKeys.has(cleanKey)) {
      seenKeys.add(cleanKey);
      result.push(m);
    }
  }
  return result;
}

export async function searchMovies(query, page = 1, limit = 25, searchType = 'name', category = 'tamil') {
  await ensureDomainsSynced();
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.max(1, parseInt(limit) || 25);
  if ((category || 'tamil').toLowerCase().trim() === 'dubbed') {
    return searchDubbedMovies(query, searchType, safePage, safeLimit);
  }
  const normQuery = (query || '').toLowerCase().trim();
  const mode = (searchType || 'name').toLowerCase().trim();

  // Actor Wise search/list mode
  if (mode === 'actor') {
    const actors = await getActorsList();
    const matchedActor = findMatchingActor(actors, normQuery);
    if (!matchedActor) {
      return {
        movies: [],
        page: safePage,
        limit: safeLimit,
        total: 0,
        totalPages: 1,
        hasMore: false,
        baseUrl: BASE_URL,
        actors,
        selectedActor: null
      };
    }

    return fetchDirectoryMoviesPaginated(matchedActor.path, safePage, safeLimit, {
      actors,
      selectedActor: matchedActor
    });
  }

  // Initial load ('latest' or empty) shows 25 latest 2026 Tamil movies per page
  if (!normQuery || normQuery === 'latest') {
    return fetchLatestMoviesPaginated(false, safePage, safeLimit);
  }

  // Year search mode
  if (mode === 'year') {
    let targetYear = normQuery;
    if (/^\d{2}$/.test(normQuery)) {
      const num = parseInt(normQuery, 10);
      targetYear = num <= 30 ? `20${normQuery}` : `19${normQuery}`;
    }

    if (ALL_YEAR_DIRS.includes(targetYear)) {
      return fetchYearMoviesPaginated(targetYear, safePage, safeLimit);
    }

    // For years without a dedicated directory (e.g. 1996, 2004), search across HD & actor collections by release year
    const [hdYearMatches, actorYearMatches] = await Promise.all([
      (async () => {
        const m = [];
        const startUrl = `${BASE_URL}/tamil-hd-movies/`;
        try {
          const html = await fetchPage(startUrl);
          const $ = cheerio.load(html);
          const totalPages = parseInt($('#totalPages').text().trim()) || 1;
          parseMovieElements($, m, targetYear, 'year');
          await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(async (p) => {
              const pHtml = await fetchPage(`${startUrl}?page=${p}`).catch(() => '');
              if (pHtml) parseMovieElements(cheerio.load(pHtml), m, targetYear, 'year');
            })
          );
        } catch (e) {}
        return m;
      })(),
      searchActorCollections(targetYear)
    ]);

    const yearMatches = [...hdYearMatches];
    for (const item of actorYearMatches) {
      if (extractYearFromTitle(item.title) === targetYear && !yearMatches.some(x => x.path === item.path)) {
        yearMatches.push(item);
      }
    }

    const enriched = await enrichPosters(yearMatches, 30);
    return {
      movies: enriched,
      page: 1,
      limit: enriched.length,
      total: yearMatches.length,
      totalPages: 1,
      hasMore: false,
      baseUrl: BASE_URL
    };
  }

  // Movie Name search mode (default)
  console.error(`[Search] Running Movie Name search for '${query}' (all results)...`);
  const firstChar = normQuery.charAt(0);
  const isAlphaStart = /[a-z]/.test(firstChar);

  let matches = [];

  if (!isAlphaStart) {
    // Numeric or symbol movie titles (e.g. '96', '29', '24'): scan all pages of all year directories + HD movies
    const [allYearMatches, hdMatches] = await Promise.all([
      searchMoviesFallback(normQuery, ALL_YEAR_DIRS, 0, 'name'),
      searchHdMovies(normQuery)
    ]);
    matches = [...allYearMatches];
    for (const match of hdMatches) {
      if (!matches.some(m => m.path === match.path)) {
        matches.push(match);
      }
    }
  } else {
    const [alphabeticalMatches, actorMatches, fallbackMatches] = await Promise.all([
      searchMoviesAlphabetical(normQuery),
      searchActorCollections(normQuery),
      searchMoviesFallback(normQuery, ['2026', '2025', '2024'], 0, 'name')
    ]);

    matches = [...alphabeticalMatches];
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

    if (matches.length === 0) {
      console.error(`[Search] Expanding Movie Name search across older years and HD directory...`);
      const [olderYearMatches, hdMatches] = await Promise.all([
        searchMoviesFallback(normQuery, ALL_YEAR_DIRS.slice(3), 0, 'name'),
        searchHdMovies(normQuery)
      ]);
      for (const match of [...olderYearMatches, ...hdMatches]) {
        if (!matches.some(m => m.path === match.path)) {
          matches.push(match);
        }
      }
    }
  }

  sortMovieNameMatches(matches, normQuery);

  const enrichedMatches = await enrichPosters(matches, 30);

  return {
    movies: enrichedMatches,
    page: 1,
    limit: enrichedMatches.length,
    total: matches.length,
    totalPages: 1,
    hasMore: false,
    baseUrl: BASE_URL
  };
}

// Helper to resolve a dubbed file ID (from /download/page/<id>/ or dubpage.xyz) directly to final download & stream servers
async function resolveDubbedFileServers(fileId, fallbackPageUrl = '') {
  const resolvedServers = [];
  let details = {};
  try {
    let dlPageUrl = `https://dubmv.xyz/download/file/${fileId}`;
    let dlPageHtml = await fetchPage(dlPageUrl).catch(() => null);

    if (!dlPageHtml && fallbackPageUrl) {
      const gate1Html = await fetchPage(fallbackPageUrl).catch(() => null);
      if (gate1Html) {
        const $g1 = cheerio.load(gate1Html);
        const step1Href = $g1('.dlink a').first().attr('href');
        if (step1Href) {
          const step1Url = new URL(step1Href, fallbackPageUrl).href;
          const gate2Html = await fetchPage(step1Url).catch(() => null);
          if (gate2Html) {
            const $g2 = cheerio.load(gate2Html);
            const step2Href = $g2('.dlink a').first().attr('href');
            if (step2Href) {
              dlPageUrl = new URL(step2Href, step1Url).href;
              dlPageHtml = await fetchPage(dlPageUrl).catch(() => null);
            }
          }
        }
      }
    }

    if (dlPageHtml) {
      const $dl = cheerio.load(dlPageHtml);
      $dl('.details').each((i, el) => {
        const text = $dl(el).text();
        if (text.includes('File Name:')) details.fileName = text.replace('File Name:', '').trim();
        else if (text.includes('File Size:')) details.fileSize = text.replace('File Size:', '').trim();
        else if (text.includes('Duration:')) details.duration = text.replace('Duration:', '').trim();
        else if (text.includes('Video Size:') || text.includes('Video Resolution:')) {
          details.resolution = text.replace(/Video (?:Size|Resolution):/, '').trim();
        } else if (text.includes('Format:')) details.format = text.replace(/.*Format:/, '').trim();
      });

      const shotImg = $dl('.albumcover img').attr('src');
      if (shotImg) {
        details.thumbnail = shotImg.startsWith('http') ? shotImg : `${DUBBED_BASE_URL}${shotImg}`;
      }

      $dl('.dlink a').each((i, el) => {
        const name = $dl(el).text().trim();
        const href = $dl(el).attr('href');
        if (name && href) {
          try {
            resolvedServers.push({ name, url: new URL(href, dlPageUrl).href });
          } catch (e) {
            resolvedServers.push({ name, url: href });
          }
        }
      });
    }
  } catch (err) {
    console.error(`[Dubbed Resolver] Error resolving fileId ${fileId}:`, err.message);
  }

  if (!resolvedServers.some(s => s.name.toLowerCase().includes('watch'))) {
    const streamUrl = `https://dub.onestream.today/stream/video/${fileId}`;
    resolvedServers.push(
      { name: 'Watch Online Server 1', url: streamUrl },
      { name: 'Watch Online Server 2', url: streamUrl }
    );
  }

  return { servers: resolvedServers, details };
}

function extractSeasonLabel(breadcrumbs = [], fileName = '') {
  const combined = `${(breadcrumbs || []).join(' ')} ${fileName || ''}`;
  const m = combined.match(/\b(?:season|s)\s*[-:.]?\s*(\d{1,2})\b/i);
  if (m) {
    return `Season ${m[1].padStart(2, '0')}`;
  }
  return '';
}

function formatFolderBreadcrumb(breadcrumbs, fileName = '', topLevelFolderCount = 1) {
  // Check if fileName has an Episode number (e.g. "Epi 01", "Episode 1", "EP 02")
  const epiMatch = (fileName || '').match(/\b(?:epi(?:sode)?|ep)\s*[-:.]?\s*(\d{1,3})\b/i);
  if (epiMatch) {
    const epNum = epiMatch[1].padStart(2, '0');
    return `Episode ${epNum}`;
  }

  if (!breadcrumbs || breadcrumbs.length === 0) return '';

  const firstFolder = breadcrumbs[0] || '';
  const printMatch = firstFolder.match(/\((original|hd\s*dvd|dvdscr|dvdrip|predvd|hd\s*tv|web\s*dl|bluray|tamil|dubbed)\)/i);

  // If the movie page only has 1 top-level folder and it's just a standard quality/print folder (e.g. "Movie (Original)"), hide redundant folder label
  const isQualityOrLangFolder = /\((?:original|tamil|dubbed|hd|hd\s*dvd|dvdscr|dvdrip|predvd|360p|480p|720p|1080p|mp4|\d+x\d+|season\s*\d+)\)/i.test(firstFolder);
  if (isQualityOrLangFolder) {
    if (topLevelFolderCount > 1 && printMatch) {
      return printMatch[1].toUpperCase() === 'ORIGINAL' ? 'Original' : printMatch[1];
    }
    return '';
  }

  return firstFolder
    .replace(/\s*Tamil\s*Dubbed\s*(?:Movie|Web\s*Series|Collections?)?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Recursively find all download links starting from a movie/collection/webseries page path/URL
export async function extractDownloadLinks(moviePath, category = '') {
  await ensureDomainsSynced();
  const isDubbed =
    (category || '').toLowerCase() === 'dubbed' ||
    moviePath.includes('isaidub') ||
    moviePath.startsWith('/movie/') ||
    moviePath.includes('dubbed');
  const activeBaseUrl = isDubbed ? DUBBED_BASE_URL : BASE_URL;
  const startUrl = moviePath.startsWith('http') ? moviePath : `${activeBaseUrl}${moviePath}`;
  const filesList = [];
  const seenFileIds = new Set();
  const visited = new Set();
  let movieInfo = null;
  let firstThumbnail = null;
  let rootTitle = '';
  let rootFolderCount = 1;

  async function traverse(url, isStartPage = false, breadcrumbs = []) {
    if (visited.has(url)) return;
    visited.add(url);

    console.error(`[Crawler] Traversing: ${url}`);
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      if (isStartPage) {
        const lineHeading = $('.line').eq(1).text().trim() || $('title').text().split('-')[0].trim();
        rootTitle = lineHeading;

        // Scrape movie info from the start page if it exists
        const infoContainer = $('#movie-info');
        if (infoContainer.length > 0) {
          movieInfo = {};
          
          const imgEl = infoContainer.find('picture img, img').first();
          if (imgEl.length > 0) {
            const src = imgEl.attr('src');
            if (src) {
              movieInfo.poster = src.startsWith('http') ? src : `${activeBaseUrl}${src}`;
            }
          }

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

          const synopsisEl = infoContainer.find('.movie-synopsis');
          if (synopsisEl.length > 0) {
            movieInfo.synopsis = synopsisEl.text().replace(/synopsis:/i, '').trim();
          }
        }
      }

      // Fast path for isaidub.green inline file blocks (.mv-content with /download/page/<fileId>/)
      const inlineFileItems = [];
      $('.mv-content').each((i, el) => {
        const linkEl = $(el).find('a[href*="/download/page/"]').first();
        const href = linkEl.attr('href');
        if (!href) return;
        const idMatch = href.match(/\/download\/page\/(\d+)/i);
        const fileId = idMatch ? idMatch[1] : null;
        if (!fileId || seenFileIds.has(fileId)) return;
        seenFileIds.add(fileId);

        const rawTitle = linkEl.text().trim();
        // Skip 1-minute sample video files (e.g. "Sample.mp4", "Watchman Sample (480x320)")
        if (/\bsample\b/i.test(rawTitle)) return;

        let fileSize = '';
        let format = '';
        $(el).find('li').each((_, li) => {
          const t = $(li).text().trim();
          if (t.includes('File Size:')) fileSize = t.replace('File Size:', '').trim();
          else if (t.includes('Download Format:')) format = t.replace('Download Format:', '').trim();
        });

        const shotSrc = $(el).find('img').attr('src');
        if (shotSrc && !firstThumbnail) {
          firstThumbnail = shotSrc.startsWith('http') ? shotSrc : `${activeBaseUrl}${shotSrc}`;
        }

        inlineFileItems.push({
          fileId,
          rawTitle,
          fileSize,
          format,
          pageUrl: href.startsWith('http') ? href : `${activeBaseUrl}${href}`,
          seasonGroup: extractSeasonLabel(breadcrumbs, rawTitle),
          folderGroup: formatFolderBreadcrumb(breadcrumbs, rawTitle, rootFolderCount)
        });
      });

      if (inlineFileItems.length > 0) {
        const resolvedInline = await Promise.all(
          inlineFileItems.map(async (item) => {
            const { servers, details } = await resolveDubbedFileServers(item.fileId, item.pageUrl);
            if (details.thumbnail && !firstThumbnail) {
              firstThumbnail = details.thumbnail;
            }
            const resolvedName = details.fileName || item.rawTitle;
            return {
              fileName: resolvedName,
              fileSize: details.fileSize || item.fileSize,
              duration: details.duration || '',
              resolution: details.resolution || '',
              format: details.format || item.format,
              seasonGroup: item.seasonGroup || extractSeasonLabel(breadcrumbs, resolvedName),
              folderGroup: item.folderGroup || formatFolderBreadcrumb(breadcrumbs, resolvedName, rootFolderCount),
              servers,
              pageUrl: item.pageUrl
            };
          })
        );
        filesList.push(...resolvedInline.filter(f => !/\bsample\b/i.test(f.fileName)));
      }

      // Check if we are on a dedicated file description page (contains .songinfo or .dlink)
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
          } else if (text.includes('Video Resolution:') || text.includes('Video Size:')) {
            resolution = text.replace(/Video (?:Resolution|Size):/, '').trim();
          } else if (text.includes('Download Format:') || text.includes('Format:')) {
            format = text.replace(/.*Format:/, '').trim();
          }
        });

        const shotSrc = $('.albumcover img').attr('src') || '';
        if (shotSrc && !firstThumbnail) {
          firstThumbnail = shotSrc.startsWith('http') ? shotSrc : `${activeBaseUrl}${shotSrc}`;
        }

        let servers = [];
        $('.dlink a').each((i, el) => {
          const name = $(el).text().trim();
          const href = $(el).attr('href');
          if (href) {
            try {
              const resolvedUrl = new URL(href, url).href;
              servers.push({ name, url: resolvedUrl });
            } catch (e) {
              servers.push({ name, url: href });
            }
          }
        });

        let fileId = null;
        for (const srv of servers) {
          const match = srv.url.match(/\/download\/(?:file|page|view)\/(\d+)/i);
          if (match) {
            fileId = match[1];
            break;
          }
        }
        if (!fileId) {
          const urlMatch = url.match(/\/download\/page\/(\d+)/i);
          if (urlMatch) fileId = urlMatch[1];
        }
        if (!fileId && shotSrc) {
          const shotMatch = shotSrc.match(/\/uploads\/shots\/(\d+)-/i);
          if (shotMatch) fileId = shotMatch[1];
        }

        if (fileId && seenFileIds.has(fileId)) {
          return;
        }
        if (fileId) {
          seenFileIds.add(fileId);
        }

        if (fileId && isDubbed) {
          const { servers: dubServers, details } = await resolveDubbedFileServers(fileId, url);
          if (dubServers.length > 0) servers = dubServers;
          fileName = fileName || details.fileName || '';
          fileSize = fileSize || details.fileSize || '';
          duration = duration || details.duration || '';
          resolution = resolution || details.resolution || '';
          format = format || details.format || '';
        } else if (fileId) {
          const resolvedServers = [];
          try {
            let dlPageUrl = `https://movies.downloadpage.xyz/download/page/${fileId}`;
            let dlPageHtml = await fetchPage(dlPageUrl).catch(() => null);

            if (!dlPageHtml && servers[0]?.url) {
              const gateHtml = await fetchPage(servers[0].url);
              const $gate = cheerio.load(gateHtml);
              const nextHref = $gate('.dlink a').first().attr('href');
              if (nextHref) {
                dlPageUrl = new URL(nextHref, servers[0].url).href;
                dlPageHtml = await fetchPage(dlPageUrl);
              }
            }

            if (dlPageHtml) {
              const $dl = cheerio.load(dlPageHtml);
              $dl('.dlink a').each((i, el) => {
                const name = $dl(el).text().trim();
                const href = $dl(el).attr('href');
                if (name && href) {
                  try {
                    const resolvedUrl = new URL(href, dlPageUrl).href;
                    resolvedServers.push({ name, url: resolvedUrl });
                  } catch (e) {
                    resolvedServers.push({ name, url: href });
                  }
                }
              });
            }
          } catch (err) {
            console.error(`[Crawler] Failed resolving final download page for fileId ${fileId}:`, err.message);
          }

          if (resolvedServers.length > 0) {
            servers = resolvedServers;
          }

          if (!servers.some(s => s.name.toLowerCase().includes('watch'))) {
            const streamUrl = `https://play.onestream.today/stream/page/${fileId}`;
            servers.push(
              { name: 'Watch Online Server 1', url: streamUrl },
              { name: 'Watch Online Server 2', url: streamUrl }
            );
          }
        }

        const finalFileName = fileName || $('title').text().trim();
        if (/\bsample\b/i.test(finalFileName)) {
          return;
        }
        filesList.push({
          fileName: finalFileName,
          fileSize,
          duration,
          resolution,
          format,
          seasonGroup: extractSeasonLabel(breadcrumbs, finalFileName),
          folderGroup: formatFolderBreadcrumb(breadcrumbs, finalFileName, rootFolderCount),
          servers,
          pageUrl: url
        });
        return;
      }

      // Extract subfolders and file links inside .f and .folder and traverse them in parallel
      const linksToFollow = [];
      $('.folder a, .f a').each((i, el) => {
        const href = $(el).attr('href');
        const linkText = $(el).text().trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('sms:') && !href.startsWith('whatsapp:')) {
          if (IGNORED_LINK_TEXTS.has(linkText.toLowerCase())) return;
          // If this link is already handled by inline .mv-content (/download/page/<id>/), skip re-fetching
          if (inlineFileItems.length > 0 && href.includes('/download/page/')) return;
          const absoluteUrl = href.startsWith('http') ? href : `${activeBaseUrl}${href}`;
          if (
            absoluteUrl !== activeBaseUrl &&
            absoluteUrl !== activeBaseUrl + '/' &&
            !absoluteUrl.includes('telegram') &&
            !linksToFollow.some(l => l.url === absoluteUrl)
          ) {
            linksToFollow.push({
              url: absoluteUrl,
              label: linkText
            });
          }
        }
      });

      if (isStartPage) {
        rootFolderCount = linksToFollow.length;
      }

      await Promise.all(
        linksToFollow.map((nextItem) =>
          traverse(nextItem.url, false, [...breadcrumbs, nextItem.label])
        )
      );

    } catch (error) {
      console.error(`[Crawler] Error traversing ${url}:`, error);
    }
  }

  await traverse(startUrl, true, []);

  if (!movieInfo && (firstThumbnail || rootTitle)) {
    const imdbPoster = isDubbed && rootTitle ? await fetchImdbPoster(rootTitle) : undefined;
    movieInfo = {
      title: rootTitle,
      poster: imdbPoster || firstThumbnail || undefined,
      language: isDubbed ? 'Tamil Dubbed' : 'Tamil',
      quality: 'HD'
    };
  } else if (movieInfo && !movieInfo.poster) {
    const imdbPoster = isDubbed && (movieInfo.title || rootTitle)
      ? await fetchImdbPoster(movieInfo.title || rootTitle)
      : undefined;
    movieInfo.poster = imdbPoster || firstThumbnail || undefined;
  }

  // Sort downloads naturally by seasonGroup, folderGroup, and fileName (so Season 01 -> Episode 01, Episode 02, ... are in clean order)
  filesList.sort((a, b) => {
    const seasonCmp = (a.seasonGroup || '').localeCompare(b.seasonGroup || '', undefined, { numeric: true });
    if (seasonCmp !== 0) return seasonCmp;
    const groupCmp = (a.folderGroup || '').localeCompare(b.folderGroup || '', undefined, { numeric: true });
    if (groupCmp !== 0) return groupCmp;
    return (a.fileName || '').localeCompare(b.fileName || '', undefined, { numeric: true });
  });

  return {
    movieInfo,
    downloads: filesList
  };
}
