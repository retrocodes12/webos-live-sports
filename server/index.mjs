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
const secondaryPrivateSiteBaseUrl = String(process.env.SECONDARY_PRIVATE_SITE_BASE_URL || '').trim();
const tertiaryPrivateSiteEnabled =
  String(process.env.TERTIARY_PRIVATE_SITE_ENABLED || '').toLowerCase() !== 'false';
const tertiaryPrivateSiteBaseUrl = String(
  process.env.TERTIARY_PRIVATE_SITE_BASE_URL || 'https://www.90live.in/?m=1'
).trim();
const quaternaryPrivateSiteEnabled =
  String(process.env.QUATERNARY_PRIVATE_SITE_ENABLED || 'true').toLowerCase() !== 'false';
const quaternaryPrivateSiteMatchListApiBaseUrl = String(
  process.env.QUATERNARY_PRIVATE_SITE_MATCH_LIST_API_BASE_URL || 'https://ws.kora-api.space/'
).trim();
const streamResolverUrl = String(process.env.STREAM_RESOLVER_URL || '').trim();
let cachedCatalog = null;
let cachedCatalogExpiresAt = 0;
let cachedCatalogLoadedAt = 0;
let catalogRefreshPromise = null;
let catalogLastError = '';
const cachedStreamsByMatchId = new Map();

function normalizeMatchName(value) {
  const genericTokens = new Set([
    'a',
    'ac',
    'af',
    'afc',
    'association',
    'c',
    'cf',
    'club',
    'da',
    'de',
    'del',
    'deportivo',
    'do',
    'fc',
    'football',
    'futbol',
    'rc',
    'sc',
    'se',
    'team',
    'the',
  ]);

  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !genericTokens.has(token))
    .join(' ');
}

function normalizeSportName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getSecondarySportPriority(sport) {
  const normalizedName = normalizeSportName(sport?.name);
  const priorityByName = new Map([
    ['mls', 0],
    ['ufc', 1],
    ['boxing', 2],
    ['f1', 3],
    ['motogp', 4],
    ['cricket', 5],
    ['tennis', 6],
    ['basketball', 7],
    ['nba', 7],
    ['mlb', 8],
  ]);

  return priorityByName.get(normalizedName) ?? 100;
}

function namesLikelyMatch(left, right) {
  const normalizedLeft = normalizeMatchName(left);
  const normalizedRight = normalizeMatchName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function findMatchingCatalogMatch(primaryMatches, candidateMatch) {
  return primaryMatches.find((entry) => {
    const homeMatches = namesLikelyMatch(entry.homeTeam, candidateMatch.homeTeam);
    const awayMatches = namesLikelyMatch(entry.awayTeam, candidateMatch.awayTeam);
    const reverseHomeMatches = namesLikelyMatch(entry.homeTeam, candidateMatch.awayTeam);
    const reverseAwayMatches = namesLikelyMatch(entry.awayTeam, candidateMatch.homeTeam);

    return (homeMatches && awayMatches) || (reverseHomeMatches && reverseAwayMatches);
  });
}

function mergeCatalogs(primaryCatalog, secondaryCatalog) {
  if (!secondaryCatalog) {
    return primaryCatalog;
  }

  const mergedSports = [...primaryCatalog.sports];
  const seenSportIds = new Set(mergedSports.map((sport) => sport.id));
  const primarySportByNormalizedName = new Map(
    mergedSports.map((sport) => [normalizeSportName(sport.name), sport])
  );
  const remappedSportIds = new Map();
  const secondaryUniqueSports = [];

  secondaryCatalog.sports.forEach((sport) => {
    const normalizedName = normalizeSportName(sport.name);
    const matchingPrimarySport = normalizedName
      ? primarySportByNormalizedName.get(normalizedName)
      : undefined;

    if (matchingPrimarySport) {
      remappedSportIds.set(sport.id, matchingPrimarySport.id);
      return;
    }

    if (!seenSportIds.has(sport.id)) {
      seenSportIds.add(sport.id);
      secondaryUniqueSports.push(sport);
    }
  });

  secondaryUniqueSports
    .sort((left, right) => {
      const priorityDelta = getSecondarySportPriority(left) - getSecondarySportPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return String(left.name || '').localeCompare(String(right.name || ''));
    })
    .forEach((sport) => {
      mergedSports.push(sport);
    });

  const mergedSportsById = new Map(mergedSports.map((sport) => [sport.id, sport]));
  const mergedMatches = [...primaryCatalog.matches];

  secondaryCatalog.matches.forEach((secondaryMatch) => {
    const remappedSportId = remappedSportIds.get(secondaryMatch.sportId) || secondaryMatch.sportId;
    const remappedSport = mergedSportsById.get(remappedSportId);
    const normalizedSecondaryMatch =
      remappedSportId === secondaryMatch.sportId && !remappedSport
        ? secondaryMatch
        : {
            ...secondaryMatch,
            sportId: remappedSportId,
            sportName: remappedSport?.name || secondaryMatch.sportName,
          };
    const existingMatch = findMatchingCatalogMatch(mergedMatches, normalizedSecondaryMatch);
    if (existingMatch) {
      if (!existingMatch.resolverQuery && normalizedSecondaryMatch.resolverQuery) {
        existingMatch.resolverQuery = normalizedSecondaryMatch.resolverQuery;
      }
      if (!existingMatch.streamCountHint && normalizedSecondaryMatch.streamCountHint) {
        existingMatch.streamCountHint = normalizedSecondaryMatch.streamCountHint;
      }
      if ((!existingMatch.tags || existingMatch.tags.length === 0) && normalizedSecondaryMatch.tags?.length) {
        existingMatch.tags = normalizedSecondaryMatch.tags;
      }
      return;
    }

    mergedMatches.push(normalizedSecondaryMatch);
  });

  return {
    sports: mergedSports,
    matches: mergedMatches,
  };
}

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
  const { module: privateResolverModule } = await loadPrivateResolverModule();

  if (!upstreamCatalogUrl) {
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
    const upstreamCatalog = adaptCatalogPayload(payload);

    if (typeof privateResolverModule.loadPrivateCatalog !== 'function' || !privateSiteBaseUrl) {
      return upstreamCatalog;
    }

    try {
      const privateCatalog = await privateResolverModule.loadPrivateCatalog({ timeoutMs: upstreamTimeoutMs });
      return mergeCatalogs(upstreamCatalog, privateCatalog);
    } catch {
      return upstreamCatalog;
    }
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

function shouldTreatStreamLookupAsPending(match, error) {
  if (!match || match.status !== 'upcoming') {
    return false;
  }

  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('could not locate a matching event page on the private website') ||
    message.includes('could not resolve streams from the private website')
  );
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
      secondaryPrivateSiteConfigured: Boolean(secondaryPrivateSiteBaseUrl),
      tertiaryPrivateSiteConfigured: Boolean(
        tertiaryPrivateSiteEnabled && tertiaryPrivateSiteBaseUrl
      ),
      quaternaryPrivateSiteConfigured: Boolean(
        quaternaryPrivateSiteEnabled && quaternaryPrivateSiteMatchListApiBaseUrl
      ),
      resolverConfigured: Boolean(
        streamResolverUrl ||
          privateSiteBaseUrl ||
          secondaryPrivateSiteBaseUrl ||
          (tertiaryPrivateSiteEnabled && tertiaryPrivateSiteBaseUrl) ||
          (quaternaryPrivateSiteEnabled && quaternaryPrivateSiteMatchListApiBaseUrl)
      ),
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
      const catalog = await fetchCatalog({ allowStaleOnError: true }).catch(() => null);
      const match = catalog?.matches?.find((entry) => entry.id === matchId) || null;
      if (shouldTreatStreamLookupAsPending(match, error)) {
        sendJson(response, 200, {
          streams: [],
          pending: true,
          message: 'Streams are not posted yet for this upcoming match. Try again closer to kickoff.',
        });
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
    streamResolverUrl ||
    (privateSiteBaseUrl ||
    secondaryPrivateSiteBaseUrl ||
    (tertiaryPrivateSiteEnabled && tertiaryPrivateSiteBaseUrl) ||
    (quaternaryPrivateSiteEnabled && quaternaryPrivateSiteMatchListApiBaseUrl)
      ? 'private site resolver'
      : 'embedded demo streams');
  console.log(`sportzx API listening on http://127.0.0.1:${port} using ${sourceLabel} and ${resolverLabel}`);
  refreshCatalogInBackground();
});
