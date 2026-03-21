import { mockCatalog } from '../data/mockData';
import type { SportsCatalog, StreamOption } from '../types';

const apiBaseUrl = import.meta.env.VITE_SPORTS_API_BASE_URL?.trim();
const streamRequestRetries = 2;

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

export async function loadSportsCatalog(): Promise<SportsCatalog> {
  if (!apiBaseUrl) {
    return mockCatalog;
  }

  const endpoint = new URL('/catalog', apiBaseUrl).toString();
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }

  return normalizeCatalog(await response.json());
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
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Stream request failed with status ${response.status}`);
      }

      return normalizeStreamList(await response.json());
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
