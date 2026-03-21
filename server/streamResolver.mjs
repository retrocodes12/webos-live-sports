import { loadPrivateResolverModule } from './privateResolver.mjs';

function buildResolverHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (process.env.STREAM_RESOLVER_AUTH_BEARER) {
    headers.Authorization = `Bearer ${process.env.STREAM_RESOLVER_AUTH_BEARER}`;
  }

  if (process.env.STREAM_RESOLVER_AUTH_HEADER_NAME && process.env.STREAM_RESOLVER_AUTH_HEADER_VALUE) {
    headers[process.env.STREAM_RESOLVER_AUTH_HEADER_NAME] = process.env.STREAM_RESOLVER_AUTH_HEADER_VALUE;
  }

  return headers;
}

function normalizeResolvedStreams(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.streams)) {
      return payload.streams;
    }
    if (Array.isArray(payload.links)) {
      return payload.links;
    }
    if (Array.isArray(payload.sources)) {
      return payload.sources;
    }
  }

  return [];
}

function normalizeStreamKind(kind, url) {
  const raw = String(kind || '').trim().toLowerCase();
  if (raw.includes('embed') || raw.includes('iframe') || raw.includes('webview')) {
    return 'embed';
  }
  if (raw.includes('dash') || raw.includes('mpd') || String(url || '').toLowerCase().includes('.mpd')) {
    return 'dash';
  }
  if (raw.includes('mp4') || String(url || '').toLowerCase().includes('.mp4')) {
    return 'mp4';
  }
  return 'hls';
}

function normalizeStreamList(streams) {
  return streams
    .map((stream, index) => {
      const url = String(
        stream?.url ||
          stream?.link ||
          stream?.playbackUrl ||
          stream?.embedUrl ||
          stream?.pageUrl ||
          stream?.src ||
          ''
      ).trim();
      if (!url) {
        return null;
      }

      return {
        id: String(stream?.id || `stream-${index + 1}`),
        label: String(stream?.label || stream?.title || stream?.name || `Feed ${index + 1}`),
        provider: String(stream?.provider || stream?.source || 'Authorized Feed'),
        quality: String(stream?.quality || stream?.resolution || 'Auto'),
        language: String(stream?.language || stream?.lang || 'English'),
        kind: normalizeStreamKind(stream?.type || stream?.kind, url),
        url,
        authorized: stream?.authorized !== false,
        drm: Boolean(stream?.drm),
        notes: typeof stream?.notes === 'string' ? stream.notes : undefined,
        headers:
          stream?.headers && typeof stream.headers === 'object' && !Array.isArray(stream.headers)
            ? stream.headers
            : undefined,
      };
    })
    .filter(Boolean);
}

export async function resolveStreamsForMatch(match, timeoutMs) {
  const { module: privateResolverModule } = await loadPrivateResolverModule();
  if (typeof privateResolverModule.resolvePrivateStreams === 'function') {
    return await privateResolverModule.resolvePrivateStreams({
      match: {
        id: match.id,
        sportId: match.sportId,
        league: match.league,
        round: match.round,
        title: match.title,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        status: match.status,
        kickoffLabel: match.kickoffLabel,
      },
      resolverQuery: match.resolverQuery || null,
      timeoutMs,
    });
  }

  const resolverUrl = String(process.env.STREAM_RESOLVER_URL || '').trim();

  if (!resolverUrl) {
    return Array.isArray(match.streams) ? match.streams : [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resolverUrl, {
      method: 'POST',
      headers: buildResolverHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        match: {
          id: match.id,
          sportId: match.sportId,
          league: match.league,
          round: match.round,
          title: match.title,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          status: match.status,
          kickoffLabel: match.kickoffLabel,
        },
        resolverQuery: match.resolverQuery || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stream resolver failed with status ${response.status}`);
    }

    const payload = await response.json();
    return normalizeStreamList(normalizeResolvedStreams(payload));
  } finally {
    clearTimeout(timeoutId);
  }
}
