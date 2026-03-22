import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { adaptCatalogPayload } from './catalogAdapter.mjs';
import { demoSourceCatalog, getDemoSourceResponse } from './demoSource.mjs';
import { loadProjectEnv } from './loadEnv.mjs';
import { manualCatalogSource } from './manualCatalog.mjs';
import { loadPrivateResolverModule } from './privateResolver.mjs';
import { resolveStreamsForMatch } from './streamResolver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

loadProjectEnv(projectRoot);

const port = Number(process.env.SPORTS_API_PORT || process.env.PORT || 8787);
const upstreamCatalogUrlTemplate = String(process.env.UPSTREAM_CATALOG_URL || '').trim();
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 12000);
const catalogCacheTtlMs = Math.max(0, Number(process.env.CATALOG_CACHE_TTL_MS || 60000));
const streamCacheTtlMs = Math.max(0, Number(process.env.STREAM_CACHE_TTL_MS || 300000));
const streamResolveRetries = Math.max(0, Number(process.env.STREAM_RESOLVE_RETRIES || 0));
const privateSiteBaseUrl = String(process.env.PRIVATE_SITE_BASE_URL || '').trim();
const streamResolverUrl = String(process.env.STREAM_RESOLVER_URL || '').trim();
let cachedCatalog = null;
let cachedCatalogExpiresAt = 0;
let cachedCatalogLoadedAt = 0;
let catalogRefreshPromise = null;
let catalogLastError = '';
const cachedStreamsByMatchId = new Map();

function buildPublicCatalog(sourceCatalog) {
  return {
    sports: sourceCatalog.sports,
    matches: sourceCatalog.matches.map((match) => {
      const { resolverQuery: _resolverQuery, ...publicMatch } = match;
      return {
        ...publicMatch,
        streams: [],
        streamCountHint:
          typeof match.streamCountHint === 'number'
            ? match.streamCountHint
            : Array.isArray(match.streams)
              ? match.streams.length
              : 0,
      };
    }),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(body);
}

function buildUpstreamHeaders() {
  const headers = {
    Accept: 'application/json',
  };

  if (process.env.UPSTREAM_AUTH_BEARER) {
    headers.Authorization = `Bearer ${process.env.UPSTREAM_AUTH_BEARER}`;
  }

  if (process.env.UPSTREAM_AUTH_HEADER_NAME && process.env.UPSTREAM_AUTH_HEADER_VALUE) {
    headers[process.env.UPSTREAM_AUTH_HEADER_NAME] = process.env.UPSTREAM_AUTH_HEADER_VALUE;
  }

  return headers;
}

function formatUpstreamDate(date) {
  return date.toISOString().slice(0, 10);
}

function resolveUpstreamCatalogUrl() {
  if (!upstreamCatalogUrlTemplate) {
    return '';
  }

  const now = new Date();
  const today = formatUpstreamDate(now);
  const yesterday = formatUpstreamDate(new Date(now.getTime() - 86_400_000));
  const tomorrow = formatUpstreamDate(new Date(now.getTime() + 86_400_000));

  return upstreamCatalogUrlTemplate
    .replaceAll('{{today}}', today)
    .replaceAll('{{yesterday}}', yesterday)
    .replaceAll('{{tomorrow}}', tomorrow);
}

async function fetchUpstreamCatalog() {
  const upstreamCatalogUrl = resolveUpstreamCatalogUrl();
  if (!upstreamCatalogUrl) {
    const { module: privateResolverModule } = await loadPrivateResolverModule();
    if (typeof privateResolverModule.loadPrivateCatalog === 'function') {
      return await privateResolverModule.loadPrivateCatalog({ timeoutMs: upstreamTimeoutMs });
    }

    if (privateSiteBaseUrl.includes('/demo-source/')) {
      return demoSourceCatalog;
    }
    return manualCatalogSource;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), upstreamTimeoutMs);

  try {
    const response = await fetch(upstreamCatalogUrl, {
      headers: buildUpstreamHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream catalog request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return adaptCatalogPayload(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCatalog({ allowStaleOnError = false } = {}) {
  const now = Date.now();
  if (cachedCatalog && cachedCatalogExpiresAt > now) {
    return cachedCatalog;
  }

  if (catalogRefreshPromise) {
    if (allowStaleOnError && cachedCatalog) {
      return cachedCatalog;
    }
    return catalogRefreshPromise;
  }

  catalogRefreshPromise = (async () => {
    const catalog = await fetchUpstreamCatalog();
    cachedCatalog = catalog;
    cachedCatalogLoadedAt = Date.now();
    cachedCatalogExpiresAt = cachedCatalogLoadedAt + catalogCacheTtlMs;
    catalogLastError = '';
    return catalog;
  })()
    .catch((error) => {
      catalogLastError =
        error instanceof Error ? error.message : 'Failed to refresh catalog cache';
      throw error;
    })
    .finally(() => {
      catalogRefreshPromise = null;
    });

  try {
    return await catalogRefreshPromise;
  } catch (error) {
    if (allowStaleOnError && cachedCatalog) {
      return cachedCatalog;
    }
    throw error;
  }
}

function refreshCatalogInBackground() {
  const now = Date.now();
  if (cachedCatalog && cachedCatalogExpiresAt > now) {
    return;
  }

  if (catalogRefreshPromise) {
    return;
  }

  void fetchCatalog({ allowStaleOnError: true }).catch(() => {});
}

async function resolveMatchStreams(match) {
  const upstreamStreams = Array.isArray(match.streams) ? match.streams : [];
  if (upstreamCatalogUrlTemplate && upstreamStreams.length > 0) {
    return upstreamStreams;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= streamResolveRetries; attempt += 1) {
    try {
      return await resolveStreamsForMatch(match, upstreamTimeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= streamResolveRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Failed to resolve streams');
}

function getCachedStreams(matchId) {
  const cachedEntry = cachedStreamsByMatchId.get(matchId);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    cachedStreamsByMatchId.delete(matchId);
    return null;
  }

  return cachedEntry.streams;
}

function setCachedStreams(matchId, streams) {
  cachedStreamsByMatchId.set(matchId, {
    streams,
    expiresAt: Date.now() + streamCacheTtlMs,
  });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL' });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    response.end();
    return;
  }

  if (request.method === 'GET') {
    const demoResponse = getDemoSourceResponse(requestUrl.pathname);
    if (demoResponse) {
      sendText(response, demoResponse.statusCode, demoResponse.body, demoResponse.contentType);
      return;
    }
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      upstreamConfigured: Boolean(upstreamCatalogUrlTemplate),
      privateSiteConfigured: Boolean(privateSiteBaseUrl),
      resolverConfigured: Boolean(streamResolverUrl || privateSiteBaseUrl),
      catalogCached: Boolean(cachedCatalog),
      catalogRefreshInFlight: Boolean(catalogRefreshPromise),
      catalogCacheAgeMs: cachedCatalogLoadedAt ? Date.now() - cachedCatalogLoadedAt : null,
      catalogLastError: catalogLastError || null,
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/catalog') {
    try {
      const now = Date.now();
      const shouldServeStale =
        Boolean(cachedCatalog) && cachedCatalogExpiresAt <= now;
      if (shouldServeStale) {
        refreshCatalogInBackground();
      }

      const catalog = await fetchCatalog({ allowStaleOnError: true });
      sendJson(response, 200, upstreamCatalogUrlTemplate ? catalog : buildPublicCatalog(catalog));
    } catch (error) {
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : 'Failed to load upstream catalog',
      });
    }
    return;
  }

  const streamRouteMatch = request.method === 'GET'
    ? requestUrl.pathname.match(/^\/matches\/([^/]+)\/streams$/)
    : null;

  if (streamRouteMatch) {
    try {
      const catalog = await fetchCatalog({ allowStaleOnError: true });
      const matchId = decodeURIComponent(streamRouteMatch[1]);
      const match = catalog.matches.find((entry) => entry.id === matchId);

      if (!match) {
        sendJson(response, 404, { error: `Match ${matchId} not found` });
        return;
      }

      const cachedStreams = getCachedStreams(matchId);
      if (cachedStreams) {
        sendJson(response, 200, { streams: cachedStreams });
        return;
      }

      const streams = await resolveMatchStreams(match);
      setCachedStreams(matchId, streams);

      sendJson(response, 200, { streams });
    } catch (error) {
      const matchId = decodeURIComponent(streamRouteMatch[1]);
      const cachedStreams = getCachedStreams(matchId);
      if (cachedStreams) {
        sendJson(response, 200, { streams: cachedStreams });
        return;
      }
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : 'Failed to resolve streams',
      });
    }
    return;
  }

  sendJson(response, 404, {
    error: 'Not found',
    availableRoutes: ['/health', '/catalog', '/matches/:id/streams'],
  });
});

server.listen(port, '0.0.0.0', () => {
  const sourceLabel =
    resolveUpstreamCatalogUrl() ||
    (privateSiteBaseUrl ? 'private source catalog' : 'manual catalog');
  const resolverLabel =
    streamResolverUrl || (privateSiteBaseUrl ? 'private site resolver' : 'embedded demo streams');
  console.log(`sportzx API listening on http://127.0.0.1:${port} using ${sourceLabel} and ${resolverLabel}`);
  refreshCatalogInBackground();
});
