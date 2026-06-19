import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';
import { searchMovies, extractDownloadLinks } from './scraper.js';

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
