const DEFAULT_ACCENTS = [
  '#2dd4bf',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#38bdf8',
  '#fb7185',
  '#a78bfa',
  '#f97316',
];

const COMPETITION_BRANDING_BY_CODE = {
  pd: {
    name: 'LaLiga',
    shortLabel: 'LL',
  },
};

function sanitizeId(input, fallback) {
  const raw = String(input || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || fallback;
}

function normalizeStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['live', 'inplay', 'in-play', 'in_play', 'playing', 'active', 'paused'].includes(raw)) {
    return 'live';
  }
  if (
    ['ended', 'complete', 'completed', 'finished', 'closed', 'awarded', 'after_extra_time', 'penalties'].includes(raw)
  ) {
    return 'ended';
  }
  return 'upcoming';
}

function getEntityName(entity, fallback = '') {
  if (typeof entity === 'string' || typeof entity === 'number') {
    return String(entity).trim();
  }

  if (entity && typeof entity === 'object') {
    return String(entity.name || entity.shortName || entity.tla || entity.code || fallback).trim();
  }

  return String(fallback).trim();
}

function getEntityLogo(entity) {
  if (!entity || typeof entity !== 'object') {
    return '';
  }

  return String(entity.crest || entity.logo || entity.emblem || '').trim();
}

function getCompetitionBranding(input) {
  const rawCode = String(input?.code || input?.id || '').trim().toLowerCase();
  const rawName = String(input?.name || input || '').trim();

  if (rawCode && COMPETITION_BRANDING_BY_CODE[rawCode]) {
    return COMPETITION_BRANDING_BY_CODE[rawCode];
  }

  if (/^primera division$/i.test(rawName)) {
    return COMPETITION_BRANDING_BY_CODE.pd;
  }

  return null;
}

function getCompetitionDisplayName(input, fallback = '') {
  const branding = getCompetitionBranding(input);
  if (branding?.name) {
    return branding.name;
  }

  return getEntityName(input, fallback);
}

function getCompetitionShortLabel(input, fallbackName = '') {
  const branding = getCompetitionBranding(input);
  if (branding?.shortLabel) {
    return branding.shortLabel;
  }

  const fallback = String(fallbackName || '').trim();
  return fallback.slice(0, 3).toUpperCase();
}

function formatStage(stage) {
  const raw = String(stage || '').trim();
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getScoreLine(match) {
  if (match?.scoreLine) {
    return String(match.scoreLine);
  }

  const score = match?.score;
  if (score && typeof score === 'object') {
    const snapshot = score.fullTime || score.regularTime || score.halfTime || null;
    if (snapshot && (snapshot.home != null || snapshot.away != null)) {
      return `${snapshot.home ?? 0} - ${snapshot.away ?? 0}`;
    }
  }

  if (match?.homeScore != null && match?.awayScore != null) {
    return `${match.homeScore} - ${match.awayScore}`;
  }

  return '0 - 0';
}

function normalizeStreamKind(kind, url) {
  const raw = String(kind || '').trim().toLowerCase();
  if (raw.includes('embed') || raw.includes('iframe') || raw.includes('webview')) {
    return 'embed';
  }
  if (raw.includes('dash') || raw.includes('mpd')) {
    return 'dash';
  }
  if (raw.includes('mp4')) {
    return 'mp4';
  }

  const lowerUrl = String(url || '').toLowerCase();
  if (lowerUrl.includes('.mpd')) {
    return 'dash';
  }
  if (lowerUrl.includes('.mp4')) {
    return 'mp4';
  }
  return 'hls';
}

function formatKickoffLabel(rawValue) {
  if (!rawValue) {
    return 'Schedule pending';
  }

  const asText = String(rawValue).trim();
  const parsedDate = new Date(asText);
  if (Number.isNaN(parsedDate.getTime())) {
    return asText;
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate);

  return formatted;
}

function normalizeSports(rawSports, fallbackMatches) {
  const explicitSports = Array.isArray(rawSports) ? rawSports : [];
  const normalized = [];
  const seen = new Set();

  explicitSports.forEach((sport, index) => {
    const name = String(
      getCompetitionDisplayName(
        {
          id: sport?.id || sport?.slug,
          code: sport?.code,
          name: sport?.name || sport?.title || sport?.label,
        },
        `Sport ${index + 1}`
      )
    ).trim();
    const id = sanitizeId(sport?.id || sport?.slug || name, `sport-${index + 1}`);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push({
      id,
      name,
      accent: String(sport?.accent || DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length]),
      shortLabel: String(
        sport?.shortLabel ||
          sport?.short ||
          getCompetitionShortLabel(
            {
              id: sport?.id || sport?.slug,
              code: sport?.code,
              name,
            },
            name
          )
      ),
      logoUrl: getEntityLogo(sport) || undefined,
    });
  });

  fallbackMatches.forEach((match, index) => {
    const name = String(
      match.sportName || match.sport || match.categoryName || match.category || match.sportId || 'General'
    );
    const id = sanitizeId(match.sportId || match.sport || match.categoryId || name, `derived-${index + 1}`);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push({
      id,
      name,
      accent: DEFAULT_ACCENTS[normalized.length % DEFAULT_ACCENTS.length],
      shortLabel: getCompetitionShortLabel({ id, name }, name),
      logoUrl: typeof match.sportLogoUrl === 'string' && match.sportLogoUrl ? match.sportLogoUrl : undefined,
    });
  });

  return normalized.length > 0
    ? normalized
    : [{ id: 'all', name: 'All Sports', accent: DEFAULT_ACCENTS[0], shortLabel: 'ALL' }];
}

function normalizeStream(stream, index) {
  const url = String(
    stream?.url ||
      stream?.playbackUrl ||
      stream?.manifestUrl ||
      stream?.embedUrl ||
      stream?.pageUrl ||
      stream?.src ||
      ''
  ).trim();
  if (!url) {
    return null;
  }

  return {
    id: String(stream?.id || stream?.feedId || `stream-${index + 1}`),
    label: String(stream?.label || stream?.title || stream?.name || `Feed ${index + 1}`),
    provider: String(stream?.provider || stream?.cdn || stream?.source || 'Authorized Feed'),
    quality: String(stream?.quality || stream?.resolution || 'Auto'),
    language: String(stream?.language || stream?.lang || 'English'),
    kind: normalizeStreamKind(stream?.kind || stream?.type || stream?.format, url),
    url,
    authorized: stream?.authorized !== false,
    drm: Boolean(stream?.drm),
    notes: typeof stream?.notes === 'string' ? stream.notes : undefined,
    headers:
      stream?.headers && typeof stream.headers === 'object' && !Array.isArray(stream.headers)
        ? stream.headers
        : undefined,
  };
}

function normalizeMatch(match, index) {
  const competitionName = getEntityName(match?.competition || match?.tournament, '');
  const competitionCode = getEntityName(match?.competition?.code, '');
  const competitionDisplayName = getCompetitionDisplayName(
    {
      id: competitionCode,
      code: competitionCode,
      name: competitionName,
    },
    competitionName
  );
  const competitionLogoUrl = getEntityLogo(match?.competition || match?.tournament);
  const homeTeam = getEntityName(
    match?.homeTeam || match?.home || match?.teamA || match?.participants?.[0],
    'Home'
  );
  const awayTeam = getEntityName(
    match?.awayTeam || match?.away || match?.teamB || match?.participants?.[1],
    'Away'
  );
  const homeLogoUrl = String(
    match?.homeLogoUrl ||
      match?.homeLogo ||
      match?.teamALogo ||
      match?.homeTeam?.crest ||
      match?.teamA?.logo ||
      match?.home?.logo ||
      match?.participants?.[0]?.logo ||
      ''
  ).trim();
  const awayLogoUrl = String(
    match?.awayLogoUrl ||
      match?.awayLogo ||
      match?.teamBLogo ||
      match?.awayTeam?.crest ||
      match?.teamB?.logo ||
      match?.away?.logo ||
      match?.participants?.[1]?.logo ||
      ''
  ).trim();
  const rawStreams = Array.isArray(match?.streams)
    ? match.streams
    : Array.isArray(match?.feeds)
      ? match.feeds
      : Array.isArray(match?.sources)
        ? match.sources
        : [];

  const streams = rawStreams
    .map((stream, streamIndex) => normalizeStream(stream, streamIndex))
    .filter(Boolean);

  return {
    id: String(match?.id || match?.eventId || `match-${index + 1}`),
    sportId: sanitizeId(
      match?.sportId ||
        match?.sport ||
        match?.categoryId ||
        match?.category ||
        competitionCode ||
        competitionDisplayName ||
        'general',
      `sport-${index + 1}`
    ),
    league: String(
      match?.league ||
        competitionDisplayName ||
        getCompetitionDisplayName(match?.tournament) ||
        'Authorized Event'
    ),
    round: String(
      match?.round ||
        (match?.matchday != null ? `Matchday ${match.matchday}` : '') ||
        formatStage(match?.stage || match?.phase) ||
        'Featured'
    ),
    title: String(match?.title || `${homeTeam} vs ${awayTeam}`),
    summary: String(match?.summary || match?.description || match?.subtitle || 'Authorized sports event.'),
    venue: String(match?.venue || match?.location || 'Venue pending'),
    status: normalizeStatus(match?.status),
    kickoffLabel: formatKickoffLabel(
      match?.kickoffLabel || match?.startTime || match?.startsAt || match?.scheduledAt || match?.utcDate
    ),
    minuteLabel:
      match?.minuteLabel || match?.clock || match?.minute
        ? String(match?.minuteLabel || match?.clock || match?.minute)
        : undefined,
    scoreLine: getScoreLine(match),
    homeTeam,
    awayTeam,
    homeLogoUrl: homeLogoUrl || getEntityLogo(match?.homeTeam) || undefined,
    awayLogoUrl: awayLogoUrl || getEntityLogo(match?.awayTeam) || undefined,
    tags: Array.isArray(match?.tags) ? match.tags.map((tag) => String(tag)) : [],
    resolverQuery:
      match?.resolverQuery &&
      typeof match.resolverQuery === 'object' &&
      !Array.isArray(match.resolverQuery)
        ? match.resolverQuery
        : undefined,
    streams,
    sportName: String(
      match?.sportName ||
        match?.sport ||
        match?.categoryName ||
        match?.category ||
        competitionDisplayName ||
        match?.sportId ||
        'General'
    ),
    sportLogoUrl: competitionLogoUrl || undefined,
  };
}

function isNormalizedCatalog(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray(payload.sports) &&
      Array.isArray(payload.matches)
  );
}

export function adaptCatalogPayload(payload) {
  if (isNormalizedCatalog(payload)) {
    const normalizedMatches = payload.matches.map((match, index) => normalizeMatch(match, index));
    const sports = normalizeSports(payload.sports, normalizedMatches);
    return {
      sports,
      matches: normalizedMatches.map(({ sportName: _sportName, sportLogoUrl: _sportLogoUrl, ...match }) => match),
    };
  }

  const rawMatches = Array.isArray(payload?.matches)
    ? payload.matches
    : Array.isArray(payload?.events)
      ? payload.events
      : Array.isArray(payload?.fixtures)
        ? payload.fixtures
        : [];

  const normalizedMatches = rawMatches.map((match, index) => normalizeMatch(match, index));
  const sports = normalizeSports(payload?.sports || payload?.categories, normalizedMatches);

  return {
    sports,
    matches: normalizedMatches.map(({ sportName: _sportName, sportLogoUrl: _sportLogoUrl, ...match }) => match),
  };
}
