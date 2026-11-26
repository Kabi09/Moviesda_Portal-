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

export const BASE_URL = (process.env.BASE_URL || 'https://moviesda36.com').replace(/\/+$/, '');

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

function derivePosterFromPath(href) {
  if (!href) return undefined;
  const slug = href.replace(/^\/+|\/+$/g, '');
  const cleanSlug = slug
    .replace(/-(?:tamil-)?(?:movie|web-series)(?:-moviesda)?(?:-download)?$/i, '')
    .replace(/-moviesda$/i, '');
  if (!cleanSlug) return undefined;
  return `${BASE_URL}/uploads/posters/${cleanSlug}.jpg`;
}

function parseMovieElements($, matches, normQuery = '', searchType = 'name') {
  $('.f a').each((i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href');
    if (title && href) {
      // Skip Moviesda directory navigation links wrapped in parentheses like "(Tamil 2025 Movies)"
      if (/^\(.*\)$/.test(title)) return;

      let isMatch = false;
      if (!normQuery) {
        isMatch = true;
      } else if (searchType === 'year') {
        const yearInTitle = extractYearFromTitle(title);
        isMatch = yearInTitle === normQuery || (normQuery.length === 2 && yearInTitle.endsWith(normQuery));
      } else {
        // Movie Name search: strip the (YYYY) release year so numbers like 96, 24, 29 don't match release years
        const cleanMovieName = stripYearFromTitle(title).toLowerCase();
        if (/^\d+$/.test(normQuery)) {
          // For pure numeric movie names (e.g. 96, 29, 24), match as a standalone number/word in the movie title
          const numRegex = new RegExp(`(^|[^0-9])${normQuery}([^0-9]|$)`);
          isMatch = numRegex.test(cleanMovieName);
        } else {
          isMatch = cleanMovieName.includes(normQuery);
        }
      }

      if (isMatch) {
        if (!matches.some(m => m.path === href)) {
          matches.push({
            title,
            path: href,
            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
            poster: derivePosterFromPath(href)
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
  return movieList;
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
  return matches.sort((a, b) => {
    const nameA = stripYearFromTitle(a.title).toLowerCase().replace(/\s*\(movie\)\s*/g, '').trim();
    const nameB = stripYearFromTitle(b.title).toLowerCase().replace(/\s*\(movie\)\s*/g, '').trim();

    const exactA = nameA === normQuery ? 1 : 0;
    const exactB = nameB === normQuery ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;

    const startA = nameA.startsWith(normQuery) ? 1 : 0;
    const startB = nameB.startsWith(normQuery) ? 1 : 0;
    if (startA !== startB) return startB - startA;

    return nameA.length - nameB.length;
  });
}

export async function searchMovies(query, page = 1, limit = 15, searchType = 'name') {
  const normQuery = (query || '').toLowerCase().trim();
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.max(1, parseInt(limit) || 15);
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

  // Initial load ('latest' or empty) shows all latest 2026 movies
  if (!normQuery || normQuery === 'latest') {
    return fetchYearMoviesPaginated('2026', safePage, safeLimit);
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

// Recursively find all download links starting from a movie page path/URL
export async function extractDownloadLinks(moviePath) {
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

        let servers = [];
        $('.dlink a').each((i, el) => {
          const name = $(el).text().trim();
          const href = $(el).attr('href');
          if (href) {
            try {
              // Resolve relative URLs using the parent page URL
              const resolvedUrl = new URL(href, url).href;
              servers.push({ name, url: resolvedUrl });
            } catch (e) {
              servers.push({ name, url: href });
            }
          }
        });

        // Resolve intermediate download pages directly to final Download Server 1/2 and Watch Online Server 1/2 URLs
        let fileId = null;
        for (const srv of servers) {
          const match = srv.url.match(/\/download\/(?:file|page)\/(\d+)/i);
          if (match) {
            fileId = match[1];
            break;
          }
        }
        if (!fileId) {
          const shotSrc = $('.albumcover img').attr('src') || '';
          const shotMatch = shotSrc.match(/\/uploads\/shots\/(\d+)-/i);
          if (shotMatch) {
            fileId = shotMatch[1];
          }
        }

        if (fileId) {
          const resolvedServers = [];
          try {
            let dlPageUrl = `https://movies.downloadpage.xyz/download/page/${fileId}`;
            let dlPageHtml = await fetchPage(dlPageUrl).catch(() => null);

            // If direct downloadpage URL changed, follow the gateway page link dynamically
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
