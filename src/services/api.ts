import { mockCatalog } from '../data/mockData';
import type { MatchCardData, MatchStreamLookupResult, SportsCatalog, StreamOption } from '../types';

const apiBaseUrl = import.meta.env.VITE_SPORTS_API_BASE_URL?.trim();
const streamRequestRetries = 2;
const catalogRequestTimeoutMs = 9000;
const streamRequestTimeoutMs = 10000;
const streamLookupCacheTtlMs = 180000;
const knownPopupDomains = [
  'increasecattle.net',
  'dynamicsnake.net',
  'newserbir.site',
  'streams.center',
  'sports-rope.top',
  'topstreamshd.top',
  'embedsports.top',
  'totalsportek.army',
  'totalsportekarmy.com',
  'fsportshdz.club',
  '1010i.com',
  'foxtrend.net',
  'ziggo-gratis.com',
];
const cachedStreamLookups = new Map<
  string,
  {
    result: MatchStreamLookupResult;
    expiresAt: number;
  }
>();
const inFlightStreamLookups = new Map<string, Promise<MatchStreamLookupResult>>();

async function delay(ms: number) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeStreamOption(stream: Partial<StreamOption>, index: number): StreamOption {
  const candidate = stream && typeof stream === 'object' ? stream : {};

  return {
    id: String(candidate.id || candidate.url || `stream-${index}`),
    label: String(candidate.label || candidate.provider || `Source ${index + 1}`),
    provider: String(candidate.provider || 'Unknown'),
    quality: String(candidate.quality || 'Auto'),
    language: String(candidate.language || 'Unknown'),
    kind:
      candidate.kind === 'hls' || candidate.kind === 'dash' || candidate.kind === 'mp4' || candidate.kind === 'embed'
        ? candidate.kind
        : 'embed',
    url: String(candidate.url || ''),
    authorized: Boolean(candidate.authorized),
    drm: typeof candidate.drm === 'boolean' ? candidate.drm : undefined,
    notes: typeof candidate.notes === 'string' ? candidate.notes : undefined,
    headers:
      candidate.headers && typeof candidate.headers === 'object'
        ? Object.keys(candidate.headers).reduce<Record<string, string>>((accumulator, key) => {
            accumulator[key] = String(candidate.headers?.[key] || '');
            return accumulator;
          }, {})
        : undefined,
  };
}

function normalizeMatchCard(match: Partial<MatchCardData>): MatchCardData {
  const matchStreams = Array.isArray(match.streams)
    ? prepareStreamsForClient(
        match.streams
          .filter(Boolean)
          .map((stream, index) => normalizeStreamOption(stream, index))
          .filter((stream) => stream.url)
      )
    : [];

  return {
    id: String(match.id || ''),
    sportId: String(match.sportId || 'unknown'),
    league: String(match.league || 'Unknown League'),
    round: String(match.round || ''),
    title: String(match.title || 'Untitled Match'),
    summary: String(match.summary || ''),
    venue: String(match.venue || ''),
    status: match.status === 'live' || match.status === 'upcoming' || match.status === 'ended' ? match.status : 'upcoming',
    kickoffLabel: String(match.kickoffLabel || 'Schedule pending'),
    minuteLabel: typeof match.minuteLabel === 'string' ? match.minuteLabel : undefined,
    scoreLine: String(match.scoreLine || ''),
    homeTeam: String(match.homeTeam || ''),
    awayTeam: String(match.awayTeam || ''),
    homeLogoUrl: typeof match.homeLogoUrl === 'string' ? match.homeLogoUrl : undefined,
    awayLogoUrl: typeof match.awayLogoUrl === 'string' ? match.awayLogoUrl : undefined,
    tags: Array.isArray(match.tags) ? match.tags.filter(Boolean).map((tag) => String(tag)) : [],
    streams: matchStreams,
    streamCountHint:
      typeof match.streamCountHint === 'number' && Number.isFinite(match.streamCountHint)
        ? match.streamCountHint
        : undefined,
  };
}

function normalizeCatalog(payload: unknown): SportsCatalog {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as SportsCatalog).sports) ||
    !Array.isArray((payload as SportsCatalog).matches)
  ) {
    throw new Error('Invalid sports catalog payload');
  }

  const catalog = payload as SportsCatalog;

  return {
    sports: catalog.sports.map((sport, index) => ({
      id: String(sport?.id || `sport-${index}`),
      name: String(sport?.name || 'Unknown Sport'),
      accent: String(sport?.accent || '#22c55e'),
      shortLabel: String(sport?.shortLabel || sport?.name || 'LIVE').slice(0, 5).toUpperCase(),
      logoUrl: typeof sport?.logoUrl === 'string' ? sport.logoUrl : undefined,
    })),
    matches: catalog.matches.map((match) => normalizeMatchCard(match)),
  };
}

function getClientStreamPenalty(stream: StreamOption) {
  const url = String(stream.url || '').toLowerCase();
  let penalty = stream.kind === 'embed' ? 20 : 0;

  if (
    url.includes('newserbir.site/player_stateless') ||
    url.includes('increasecattle.net/embed/') ||
    url.includes('dynamicsnake.net/embed/') ||
    url.includes('foxtrend.net/event/') ||
    url.includes('ziggo-gratis.com/') ||
    url.includes('streams.center/embed/')
  ) {
    penalty += 100;
  }

  try {
    const hostname = new URL(stream.url).hostname.toLowerCase();
    if (knownPopupDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      penalty += 100;
    }
  } catch {
    penalty += 10;
  }

  return penalty;
}

function shouldSuppressClientStream(stream: StreamOption) {
  return getClientStreamPenalty(stream) >= 100;
}

function getClientStreamKindPriority(stream: StreamOption) {
  if (stream.kind === 'hls') {
    return 0;
  }
  if (stream.kind === 'mp4') {
    return 1;
  }
  if (stream.kind === 'dash') {
    return 2;
  }
  return 3;
}

function sortStreamsForClient(streams: StreamOption[]) {
  return [...streams].sort((left, right) => {
    const penaltyDelta = getClientStreamPenalty(left) - getClientStreamPenalty(right);
    if (penaltyDelta !== 0) {
      return penaltyDelta;
    }

    const kindDelta = getClientStreamKindPriority(left) - getClientStreamKindPriority(right);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return 0;
  });
}

function prepareStreamsForClient(streams: StreamOption[]) {
  const sortedStreams = sortStreamsForClient(streams);
  const preferredStreams = sortedStreams.filter((stream) => !shouldSuppressClientStream(stream));

  return preferredStreams.length > 0 ? preferredStreams : sortedStreams;
}

function normalizeStreamLookupResult(payload: unknown): MatchStreamLookupResult {
  if (Array.isArray(payload)) {
    return {
      streams: prepareStreamsForClient(
        (payload as StreamOption[])
          .filter(Boolean)
          .map((stream, index) => normalizeStreamOption(stream, index))
          .filter((stream) => stream.url)
      ),
    };
  }

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { streams?: StreamOption[] }).streams)
  ) {
    const matchStreams = (payload as { streams: StreamOption[] }).streams;

    return {
      streams: prepareStreamsForClient(
        matchStreams
          .filter(Boolean)
          .map((stream, index) => normalizeStreamOption(stream, index))
          .filter((stream) => stream.url)
      ),
      pending: Boolean((payload as { pending?: boolean }).pending),
      message:
        typeof (payload as { message?: string }).message === 'string'
          ? (payload as { message: string }).message
          : undefined,
    };
  }

  throw new Error('Invalid stream lookup payload');
}

function cloneStreamLookupResult(result: MatchStreamLookupResult): MatchStreamLookupResult {
  return {
    streams: [...result.streams],
    pending: result.pending,
    message: result.message,
  };
}

function getCachedStreamLookup(matchId: string) {
  const cachedEntry = cachedStreamLookups.get(matchId);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    cachedStreamLookups.delete(matchId);
    return null;
  }

  return cloneStreamLookupResult(cachedEntry.result);
}

function setCachedStreamLookup(matchId: string, result: MatchStreamLookupResult) {
  cachedStreamLookups.set(matchId, {
    result: cloneStreamLookupResult(result),
    expiresAt: Date.now() + streamLookupCacheTtlMs,
  });
}

async function fetchJson(endpoint: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadSportsCatalog(): Promise<SportsCatalog> {
  if (!apiBaseUrl) {
    return mockCatalog;
  }

  const endpoint = new URL('/catalog', apiBaseUrl).toString();
  return normalizeCatalog(await fetchJson(endpoint, catalogRequestTimeoutMs));
}

export function invalidateMatchStreams(matchId: string) {
  cachedStreamLookups.delete(matchId);
  inFlightStreamLookups.delete(matchId);
}

async function requestMatchStreams(matchId: string): Promise<MatchStreamLookupResult> {
  if (!apiBaseUrl) {
    const match = mockCatalog.matches.find((entry) => entry.id === matchId);
    return {
      streams: prepareStreamsForClient(match?.streams || []),
    };
  }

  const endpoint = new URL(`/matches/${encodeURIComponent(matchId)}/streams`, apiBaseUrl).toString();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= streamRequestRetries; attempt += 1) {
    try {
      return normalizeStreamLookupResult(await fetchJson(endpoint, streamRequestTimeoutMs));
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Stream request failed');
      if (attempt >= streamRequestRetries) {
        throw lastError;
      }
      await delay(500 * (attempt + 1));
    }
  }

  throw lastError || new Error('Stream request failed');
}

export async function loadMatchStreams(
  matchId: string,
  { force = false }: { force?: boolean } = {}
): Promise<MatchStreamLookupResult> {
  if (force) {
    invalidateMatchStreams(matchId);
  } else {
    const cachedLookup = getCachedStreamLookup(matchId);
    if (cachedLookup) {
      return cachedLookup;
    }

    const inFlightLookup = inFlightStreamLookups.get(matchId);
    if (inFlightLookup) {
      return cloneStreamLookupResult(await inFlightLookup);
    }
  }

  const lookupPromise = requestMatchStreams(matchId)
    .then((result) => {
      setCachedStreamLookup(matchId, result);
      return cloneStreamLookupResult(result);
    })
    .finally(() => {
      inFlightStreamLookups.delete(matchId);
    });

  inFlightStreamLookups.set(matchId, lookupPromise);
  return cloneStreamLookupResult(await lookupPromise);
}

export function preloadMatchStreams(matchId: string) {
  return loadMatchStreams(matchId).then(() => undefined).catch(() => undefined);
}
