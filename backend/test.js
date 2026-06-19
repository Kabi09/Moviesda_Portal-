import * as cheerio from 'cheerio';

const BASE_URL = 'https://moviesda32.com';

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
  console.log(`[Search] Querying alphabetical directory: ${startUrl}`);

  try {
    const html = await fetchPage(startUrl);
    const $ = cheerio.load(html);
    const totalPagesText = $('#totalPages').text().trim();
    const totalPages = parseInt(totalPagesText) || 1;

    parseMovieElements($, matches, normQuery);

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
    console.error(`Alphabetical search failed:`, error);
  }

  return matches;
}

async function searchMoviesFallback(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  const years = ['2026', '2025', '2024'];
  console.log(`[Fallback] Querying year directories: ${years.join(', ')}`);

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
      console.error(`Failed searching directory for year ${year}:`, error);
    }
  }

  return matches;
}

async function searchHdMovies(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  const startUrl = `${BASE_URL}/tamil-hd-movies/`;
  console.log(`[HD Search] Scanning HD movies directory: ${startUrl}`);

  try {
    const html = await fetchPage(startUrl);
    const $ = cheerio.load(html);
    const totalPagesText = $('#totalPages').text().trim();
    const totalPages = parseInt(totalPagesText) || 1;
    console.log(`[HD Search] Total pages in HD movies category: ${totalPages}`);

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
          console.error(`Failed fetching page ${page}:`, err);
        }
      })());
    }
    await Promise.all(promises);
  } catch (error) {
    console.error(`HD movies search failed:`, error);
  }

  return matches;
}

async function searchActorCollections(query) {
  const normQuery = query.toLowerCase().trim();
  const matches = [];
  console.log(`[Actor Search] Scanning actor collections...`);

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
    console.log(`[Actor Search] Found ${actorPaths.length} actor collection folders`);

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
    console.error(`Actor search failed:`, error);
  }

  return matches;
}

async function searchMovies(query) {
  const normQuery = query.toLowerCase().trim();
  if (!normQuery) return [];

  console.log(`[Search] Running parallel search for '${query}' across alphabetical, actor, and year listings...`);

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
    console.log(`[Search] Running HD movies directory search as fallback...`);
    const hdMatches = await searchHdMovies(normQuery);
    for (const match of hdMatches) {
      if (!matches.some(m => m.path === match.path)) {
        matches.push(match);
      }
    }
  }
  return matches;
}

async function extractDownloadLinks(moviePath) {
  const startUrl = moviePath.startsWith('http') ? moviePath : `${BASE_URL}${moviePath}`;
  const filesList = [];
  const visited = new Set();

  async function traverse(url) {
    if (visited.has(url)) return;
    visited.add(url);

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      if ($('.songinfo').length > 0 || $('.dlink').length > 0) {
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
      console.error(`Error traversing ${url}:`, error);
    }
  }

  await traverse(startUrl);
  return filesList;
}

async function runTests() {
  console.log("-----------------------------------------");
  console.log("Searching movies for 'Velayudham'...");
  const results = await searchMovies("youth");
  console.log("Search Results:", JSON.stringify(results, null, 2));

  for (const movie of results.slice(0, 2)) {
    console.log("-----------------------------------------");
    console.log(`Extracting download links for '${movie.title}' (${movie.path})...`);
    const downloads = await extractDownloadLinks(movie.path);
    console.log("Downloads:", JSON.stringify(downloads, null, 2));
  }
}

runTests();
