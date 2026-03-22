import { mockCatalog } from '../data/mockData';
import type { MatchStreamLookupResult, SportsCatalog, StreamOption } from '../types';

const apiBaseUrl = import.meta.env.VITE_SPORTS_API_BASE_URL?.trim();
const streamRequestRetries = 2;
const catalogRequestTimeoutMs = 9000;
const streamRequestTimeoutMs = 10000;

async function delay(ms: number) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
    ...catalog,
    matches: catalog.matches.map((match) => ({
      ...match,
      streams: prepareStreamsForClient(match.streams || []),
    })),
  };
}

function getClientStreamPenalty(stream: StreamOption) {
  const url = String(stream.url || '').toLowerCase();

  if (
    url.includes('newserbir.site/player_stateless') ||
    url.includes('increasecattle.net/embed/') ||
    url.includes('dynamicsnake.net/embed/') ||
    url.includes('foxtrend.net/event/') ||
    url.includes('ziggo-gratis.com/') ||
    url.includes('streams.center/embed/')
  ) {
    return 100;
  }

  return 0;
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
      streams: prepareStreamsForClient(payload as StreamOption[]),
    };
  }

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { streams?: StreamOption[] }).streams)
  ) {
    return {
      streams: prepareStreamsForClient((payload as { streams: StreamOption[] }).streams),
      pending: Boolean((payload as { pending?: boolean }).pending),
      message:
        typeof (payload as { message?: string }).message === 'string'
          ? (payload as { message: string }).message
          : undefined,
    };
  }

  throw new Error('Invalid stream lookup payload');
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

export async function loadMatchStreams(matchId: string): Promise<MatchStreamLookupResult> {
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
