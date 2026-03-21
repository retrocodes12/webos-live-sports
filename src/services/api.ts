import { mockCatalog } from '../data/mockData';
import type { SportsCatalog, StreamOption } from '../types';

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

  return payload as SportsCatalog;
}

function normalizeStreamList(payload: unknown): StreamOption[] {
  if (Array.isArray(payload)) {
    return payload as StreamOption[];
  }

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { streams?: StreamOption[] }).streams)
  ) {
    return (payload as { streams: StreamOption[] }).streams;
  }

  throw new Error('Invalid stream list payload');
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

export async function loadMatchStreams(matchId: string): Promise<StreamOption[]> {
  if (!apiBaseUrl) {
    const match = mockCatalog.matches.find((entry) => entry.id === matchId);
    return match?.streams || [];
  }

  const endpoint = new URL(`/matches/${encodeURIComponent(matchId)}/streams`, apiBaseUrl).toString();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= streamRequestRetries; attempt += 1) {
    try {
      return normalizeStreamList(await fetchJson(endpoint, streamRequestTimeoutMs));
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
