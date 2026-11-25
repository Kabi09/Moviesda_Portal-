# Moviesda Web Search Portal & Crawler — Deep Project Documentation

This document provides a comprehensive technical breakdown of the **Moviesda Web Search Portal**, covering its architecture, multi-tiered scraping engine, Model Context Protocol (MCP) server, REST APIs, frontend design system, and deployment topology.

---

## 1. Executive Summary & Architecture Overview

The **Moviesda Web Search Portal** is a full-stack web application and AI-ready crawler service. It transforms a traditional, link-heavy directory structure from `moviesda32.com` into a modern, fast, glassmorphic web portal.

### Key Capabilities
- **Multi-Vector Search Pipeline**: Dispatches concurrent search requests across alphabetical archives, actor collections, release year categories, and HD movie indices.
- **Recursive Link Crawler**: Traverses directory paths (`.folder`, `.f`) automatically to isolate file download pages, extracting direct server mirror URLs and technical media specs.
- **Rich Media Extraction**: Asynchronously extracts movie poster art, synopsis, director, cast, release year, video resolution, duration, format, and file sizes.
- **Dual Interface**:
  - **Human Web UI**: Built with React 19 and Vite with a premium dark glassmorphism theme and real-time state management.
  - **AI Agent Interface**: Built on the `@modelcontextprotocol/sdk` (MCP), exposing structured tools over standard I/O (`stdio`) or Server-Sent Events (`sse`).
- **Telemetry & Analytics**: Integrated privacy-preserving event tracking via Umami Analytics.

```
                           +-------------------------------------+
                           |            End User / AI            |
                           +------------------+------------------+
                                              |
                   +--------------------------+--------------------------+
                   |                                                     |
                   v                                                     v
        +----------------------+                              +----------------------+
        |     Web Browser      |                              |  AI Client / Claude  |
        |  (React 19 Frontend) |                              |    (MCP Client)      |
        +----------+-----------+                              +----------+-----------+
                   |                                                     |
             REST API Calls                                        JSON-RPC /
          (/api/search, /api/downloads)                             Stdio or SSE
                   |                                                     |
                   +--------------------------+--------------------------+
                                              |
                                              v
                              +-------------------------------+
                              |    Node.js Backend Engine     |
                              |   (Express-free HTTP / MCP)   |
                              +---------------+---------------+
                                              |
                              +---------------+---------------+
                              |     Cheerio Scraper Core      |
                              |        (scraper.js)           |
                              +---------------+---------------+
                                              |
                                         HTTP Fetch
                                              |
                                              v
                              +-------------------------------+
                              |       moviesda32.com          |
                              |  (Target Movie Directory)     |
                              +-------------------------------+
```

---

## 2. System Architecture & Component Hierarchy

### 2.1 Repository Directory Structure

```
Movie/
├── .gitignore                    # Root git ignore rules
├── README.md                     # High-level overview and run instructions
├── PROJECT_DETAILS.md            # Master technical documentation
├── backend/                      # Crawler service, REST server & MCP tool provider
│   ├── .env                      # BASE_URL, PORT, TRANSPORT configuration
│   ├── index.js                  # Unified server: Stdio/SSE MCP + Native HTTP REST API
│   ├── scraper.js                # Core scraping engine (search, traverse, extract)
│   ├── package.json              # Backend dependencies: @modelcontextprotocol/sdk, cheerio
│   └── api/                      # Vercel Serverless Function entrypoints
│       ├── search.js             # GET /api/search serverless route
│       └── downloads.js          # GET /api/downloads serverless route
└── frontend/                     # Modern React client
    ├── .env                      # Frontend environment: VITE_API_BASE
    ├── index.html                # Entry HTML with Umami script
    ├── package.json              # Frontend dependencies: react 19, lucide-react, vite
    ├── vite.config.js            # Vite build configuration with @vitejs/plugin-react
    ├── eslint.config.js          # ESLint flat config
    └── src/
        ├── main.jsx              # React DOM initialization (StrictMode)
        ├── App.jsx               # Main stateful component, search UI, and detail modal
        ├── index.css             # Glassmorphic CSS design system and responsive layout
        └── assets/               # Static assets
```

---

## 3. Deep Dive: Scraping & Crawling Engine (`scraper.js`)

The backend engine avoids headless browsers (like Puppeteer or Playwright), utilizing lightweight Node.js native `fetch` combined with `cheerio` for fast HTML parsing.

### 3.1 Parallel Search Engine (`searchMovies`)

Because `moviesda32.com` does not have an open SQL or elasticsearch API, search queries must be gathered across disparate navigational hierarchies. The scraper runs **4 discovery pipelines in parallel**:

```
                       User Search Query (e.g., "Leo")
                                     |
             +-----------------------+-----------------------+
             |                       |                       |
             v                       v                       v
     [Alphabetical]               [Actors]                [Years]
   /tamil-movies/l/        /tamil-movies-collection/  /tamil-2026-movies/
   (Multi-page scan)        (Scans actor subfolders)  /tamil-2025-movies/
             |                       |                /tamil-2024-movies/
             +-----------------------+-----------------------+
                                     |
                         Matches Found? ----(No)----> [HD Movies Fallback]
                                     |                /tamil-hd-movies/
                                    (Yes)                    |
                                     |                       v
                                     +-----------------------+
                                     |
                             Deduplicate by Path
                                     |
                       Top 16 Poster Image Enrichment
                                     |
                           Return Enriched List
```

1. **Alphabetical Directory Search (`searchMoviesAlphabetical`)**:
   - Takes the first letter of the query (e.g. `'l'` for "Leo").
   - Fetches `${BASE_URL}/tamil-movies/${letter}/`.
   - Parses the `#totalPages` element to compute total pagination.
   - Uses `Promise.all` to fetch remaining pages concurrently.
   - Extracts all matching `<a>` tags inside `.f`.
2. **Actor Collections Search (`searchActorCollections`)**:
   - Traverses `${BASE_URL}/tamil-movies-collection/` (pages 1 and 2).
   - Extracts all actor directory links matching `/actor-*`.
   - Traverses each actor subfolder and its subsequent pages in parallel to find title matches.
3. **Year Directory Fallback (`searchMoviesFallback`)**:
   - Iterates through recent year directories: `tamil-2026-movies`, `tamil-2025-movies`, and `tamil-2024-movies`.
   - Reads `#totalPages` (capped at 3 pages per year for latency control) and parses movie entries.
4. **HD Movies Directory (`searchHdMovies`)**:
   - Triggered as a secondary fallback if the total matches from steps 1–3 are zero or if the query starts with a non-alphabetic character (e.g., numeric queries like "2018" or "3").
   - Scans all pages under `/tamil-hd-movies/`.
5. **Deduplication & Poster Enrichment**:
   - Results from all four streams are merged, removing duplicates by comparing `match.path`.
   - For the top 16 results, an asynchronous parallel sub-request is dispatched to each movie's landing page to extract the high-resolution poster image from `#movie-info picture img, img`.

---

### 3.2 Recursive Crawl & Link Extraction (`extractDownloadLinks`)

Once a user selects a movie, the crawler traverses nested subdirectories until it reaches the final media download pages.

```
Start Movie URL (/leo-2023-tamil-movie/)
   │
   ├─► Scrapes Movie Metadata (#movie-info)
   │   (Title, Poster, Director, Cast, Genres, Rating, Synopsis)
   │
   └─► Recursive Traversal
       ├── Subfolder 1 (/leo-original-mp4/)
       │   └── File Page (/leo-720p.html)
       │       └── Details (.songinfo, .details) & Mirrors (.dlink a)
       │
       └── Subfolder 2 (/leo-sample.html) [Ignored / Scraped]
```

#### Traversal Algorithm:
1. **Cycle Prevention**: Maintains a `visited = new Set()` of URLs to prevent cyclic navigation loops.
2. **Metadata Extraction (Start Page)**:
   - On the root page (`isStartPage = true`), parses the `#movie-info` card.
   - Maps metadata key-values:
     - `movie` -> Title
     - `director` -> Director name
     - `starring` -> Cast list
     - `genres` -> Genre categories
     - `quality` -> Quality rating (e.g. HD AVC, HDRip)
     - `language` -> Audio languages
     - `movie rating` -> Numeric or star rating
     - `last updated` -> Timestamp
     - `.movie-synopsis` -> Plot description
3. **Leaf Node Detection (File Download Page)**:
   - A page is identified as a download target if it contains `.songinfo` or `.dlink`.
   - The crawler parses `.details` elements to isolate:
     - **File Name**
     - **File Size** (e.g. `1.4 GB`, `450 MB`)
     - **Duration** (e.g. `2h 35m`)
     - **Video Resolution** (e.g. `1280x720`, `640x360`)
     - **Download Format** (e.g. `mp4`, `mkv`)
   - It captures all mirror links within `.dlink a`.
   - Relative URLs are converted to fully qualified URLs via `new URL(href, url).href`.
4. **Branch Node Traversal (Directories)**:
   - When not on a leaf page, the crawler identifies all links under `.f a` and `.folder a`.
   - Filters out domain root URLs and external Telegram redirect links.
   - Recursively executes `traverse(nextUrl)` until all branches are resolved.

---

## 4. Backend Server Architecture (`backend/index.js`)

The backend is built with zero large web frameworks (pure Node.js standard `http` module + `@modelcontextprotocol/sdk`). It supports three distinct operational modes simultaneously:

### 4.1 Native REST API Server
Runs when `TRANSPORT=sse` or when started locally on port 3000:
- **`GET /api/search?q={query}`**: Triggers `searchMovies(query)`.
- **`GET /api/downloads?path={moviePath}`**: Triggers `extractDownloadLinks(moviePath)`.
- Full preflight CORS support (`OPTIONS` handling, permissive headers).

### 4.2 Model Context Protocol (MCP) Server
Allows AI agents (like Claude Desktop, Antigravity, or custom LLM runners) to use Moviesda as an autonomous tool:
- **`search_movies`**:
  ```json
  {
    "name": "search_movies",
    "description": "Search for movies on moviesda32.com by title (case-insensitive). Can search by year or alphabet.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "The movie title, year, or keyword to search" }
      },
      "required": ["query"]
    }
  }
  ```
- **`get_movie_downloads`**:
  ```json
  {
    "name": "get_movie_downloads",
    "description": "Recursively search and extract download details and direct server links for a specific movie path/URL.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "movie_path": { "type": "string", "description": "The relative path or absolute URL of the movie details page" }
      },
      "required": ["movie_path"]
    }
  }
  ```
- **Transports Supported**:
  - `stdio`: Used by desktop AI runners via standard in/out pipes.
  - `sse`: Exposes `/sse` (for SSE stream connection) and `/messages` (for POSTing client JSON-RPC commands).

### 4.3 Vercel Serverless Functions (`backend/api/`)
- `backend/api/search.js`: Exposes the search endpoint as a serverless lambda.
- `backend/api/downloads.js`: Exposes the downloads endpoint as a serverless lambda.
- Both modules include standardized CORS headers and flexible parameter handling (`q` or `query`, `path` or `movie_path`).

---

## 5. Frontend Architecture & Design System (`frontend/`)

### 5.1 Technology Stack
- **Framework**: React 19 (`react`, `react-dom`)
- **Build Tool**: Vite 8 (`@vitejs/plugin-react`)
- **Iconography**: `lucide-react`
- **Analytics**: Umami Cloud Analytics

### 5.2 State Management (`App.jsx`)

The entire state is centrally managed within `App.jsx`:

| State Variable | Type | Purpose |
| :--- | :--- | :--- |
| `query` | `string` | Search input text (defaults to `'dude'` on first load for instant showcase) |
| `movies` | `Array<Movie>` | Array of enriched movie card objects matching the current query |
| `selectedMovie` | `Movie \| null` | Movie currently active inside the modal details overlay |
| `downloads` | `Array<FileDownload>` | Resolved download links, resolutions, and server mirrors |
| `movieDetails` | `MovieDetails \| null` | Scraped metadata (cast, director, synopsis, genres, rating) |
| `loadingSearch` | `boolean` | True while searching and enriching search results |
| `loadingDownloads`| `boolean` | True while recursively crawling and extracting download links |
| `error` | `string` | Global error message for network or scraper failures |
| `searched` | `boolean` | Tracks whether at least one search has executed |

### 5.3 UX & UI Patterns

1. **Clean Title Formatting**:
   - `extractYear(title)`: Uses regex `/\((\d{4})\)/` to isolate the release year.
   - `cleanTitle(title)`: Removes parenthesized years from titles so names display neatly.
2. **Interactive Modal Dialog**:
   - Split layout: Left column showcases high-res poster and organized metadata; right column displays downloadable file formats with badges for file size, duration, and resolution.
   - Click-outside detection and Escape close handling.
3. **Telemetry & Analytics Integration**:
   - In `frontend/index.html`, the Umami tracking script is loaded asynchronously with website ID `ca0fe887-642f-472b-a2d0-31aab4e9cce2`.
   - In `frontend/src/App.jsx`, user-initiated searches trigger:
     ```javascript
     if (e && typeof window !== 'undefined' && window.umami) {
       window.umami.track(`Movie: ${cleanQuery}`, { name: cleanQuery });
     }
     ```
   - Automatically bypasses initial automatic component mounts to prevent false search metrics.

### 5.4 Glassmorphic Styling (`index.css`)
- **Color Palette**:
  - Background main: `#0a0d14` with multi-angle radial gradients.
  - Card background: `rgba(18, 24, 38, 0.6)` with backdrop blur.
  - Accents: Coral (`#ff6b8b`), Magenta (`#d946ef`), Violet (`#8b5cf6`).
- **Typography**: Google Fonts `'Outfit'` (300 to 800 weights).
- **Responsive Breakpoints**: Fluid scaling for mobile devices (320px–480px), tablets (768px), laptops (1024px), and desktop displays (1200px+).

---

## 6. API Contracts & Data Specifications

### 6.1 `GET /api/search?q={query}`

#### Request Query Parameters
- `q` (string, required): Search query (e.g. `Leo`, `Drishyam`, `2024`).

#### Response Schema
```json
[
  {
    "title": "Leo (2023)",
    "path": "/leo-2023-tamil-movie/",
    "url": "https://moviesda32.com/leo-2023-tamil-movie/",
    "poster": "https://moviesda32.com/uploads/posters/leo-2023.jpg"
  }
]
```

---

### 6.2 `GET /api/downloads?path={moviePath}`

#### Request Query Parameters
- `path` (string, required): Relative or absolute movie landing path (e.g. `/leo-2023-tamil-movie/`).

#### Response Schema
```json
{
  "movieInfo": {
    "title": "Leo",
    "director": "Lokesh Kanagaraj",
    "starring": "Vijay, Sanjay Dutt, Trisha",
    "genres": "Action, Thriller",
    "quality": "Original HD",
    "language": "Tamil",
    "rating": "8.2",
    "lastUpdated": "2023-10-20",
    "synopsis": "Parthiban is a mild-mannered cafe owner in Theog...",
    "poster": "https://moviesda32.com/uploads/posters/leo-2023.jpg"
  },
  "downloads": [
    {
      "fileName": "Leo (720p HD).mp4",
      "fileSize": "1.4 GB",
      "duration": "2h 44m",
      "resolution": "1280x720",
      "format": "mp4",
      "pageUrl": "https://moviesda32.com/leo-720p-page.html",
      "servers": [
        {
          "name": "Download Server 1",
          "url": "https://moviesda32.com/download/file/server1/leo720.mp4"
        },
        {
          "name": "Download Server 2",
          "url": "https://moviesda32.com/download/file/server2/leo720.mp4"
        }
      ]
    }
  ]
}
```

---

## 7. Environment Configuration Reference

### Backend (`backend/.env`)
```env
# The source directory base URL
BASE_URL=https://moviesda32.com

# HTTP listening port
PORT=3000

# MCP transport mode: 'stdio' (for CLI/AI tools) or 'sse' (for web APIs & SSE)
TRANSPORT=sse
```

### Frontend (`frontend/.env`)
```env
# URL pointing to the active backend API
VITE_API_BASE=http://localhost:3000/api
```

---

## 8. Deployment Architecture

### Option A: Local Execution
1. **Backend**:
   ```bash
   cd backend
   npm install
   node index.js
   ```
2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Option B: Cloud Deployment (Vercel)
The project structure allows clean multi-project deployment on Vercel:
1. **Backend Vercel Project**:
   - Set **Root Directory** to `backend`.
   - Vercel automatically exposes `api/search.js` as `/api/search` and `api/downloads.js` as `/api/downloads`.
   - Configure environment variable: `BASE_URL=https://moviesda32.com`.
2. **Frontend Vercel Project**:
   - Set **Root Directory** to `frontend`.
   - Set build command to `npm run build` and output directory to `dist`.
   - Configure environment variable: `VITE_API_BASE=https://<your-backend-vercel-url>/api`.

---

## 9. Resilience, Edge Cases & Maintenance Notes

1. **Domain Changes**:
   - If Moviesda updates its primary domain (e.g. from `moviesda32.com` to `moviesda33.com`), simply update `BASE_URL` in `backend/.env` without modifying scraper source code.
2. **Anti-Scraping & Headers**:
   - All outgoing requests in `scraper.js` set a standard Chrome user agent:
     `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36`.
3. **Link Normalization**:
   - Some download links returned by the directory are relative (e.g., `download.php?id=...`). The crawler uses `new URL(href, url).href` to ensure that every returned link is fully resolved and clickable.
4. **Ad & Telegram Filtration**:
   - Traversal logic explicitly ignores links containing `telegram` or pointing back to the root domain, avoiding infinite redirect loops and ad trap pages.
