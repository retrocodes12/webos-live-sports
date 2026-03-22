import { load } from 'cheerio';

const RESOLVER_URL = process.env.STREAM_RESOLVER_URL || '';
const RESOLVER_BEARER = process.env.STREAM_RESOLVER_AUTH_BEARER || '';
const PRIVATE_SITE_BASE_URL = process.env.PRIVATE_SITE_BASE_URL || '';
const PRIVATE_SITE_SEARCH_URL_TEMPLATE = process.env.PRIVATE_SITE_SEARCH_URL_TEMPLATE || '';
const PRIVATE_SITE_FALLBACK_PAGE_URL = process.env.PRIVATE_SITE_FALLBACK_PAGE_URL || '';
const PRIVATE_SITE_MATCH_LINK_SELECTOR =
  process.env.PRIVATE_SITE_MATCH_LINK_SELECTOR || 'a[href]';
const PRIVATE_SITE_CATALOG_CARD_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_CARD_SELECTOR || '';
const PRIVATE_SITE_CATALOG_LINK_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_LINK_SELECTOR || PRIVATE_SITE_MATCH_LINK_SELECTOR;
const PRIVATE_SITE_CATALOG_TITLE_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_TITLE_SELECTOR || '';
const PRIVATE_SITE_CATALOG_LEAGUE_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_LEAGUE_SELECTOR || '';
const PRIVATE_SITE_CATALOG_ROUND_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_ROUND_SELECTOR || '';
const PRIVATE_SITE_CATALOG_VENUE_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_VENUE_SELECTOR || '';
const PRIVATE_SITE_CATALOG_KICKOFF_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_KICKOFF_SELECTOR || '';
const PRIVATE_SITE_CATALOG_STATUS_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_STATUS_SELECTOR || '';
const PRIVATE_SITE_CATALOG_SCORE_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_SCORE_SELECTOR || '';
const PRIVATE_SITE_CATALOG_SUMMARY_SELECTOR =
  process.env.PRIVATE_SITE_CATALOG_SUMMARY_SELECTOR || '';
const PRIVATE_SITE_DEFAULT_SPORT_ID =
  process.env.PRIVATE_SITE_DEFAULT_SPORT_ID || 'football';
const PRIVATE_SITE_DEFAULT_SPORT_NAME =
  process.env.PRIVATE_SITE_DEFAULT_SPORT_NAME || 'Football';
const PRIVATE_SITE_DEFAULT_SPORT_ACCENT =
  process.env.PRIVATE_SITE_DEFAULT_SPORT_ACCENT || '#22c55e';
const PRIVATE_SITE_DEFAULT_SPORT_SHORT_LABEL =
  process.env.PRIVATE_SITE_DEFAULT_SPORT_SHORT_LABEL || 'FTB';
const PRIVATE_SITE_DEFAULT_LEAGUE =
  process.env.PRIVATE_SITE_DEFAULT_LEAGUE || 'External Source';
const PRIVATE_SITE_CATALOG_LIMIT = Math.max(
  1,
  Number(process.env.PRIVATE_SITE_CATALOG_LIMIT || 24)
);
const PRIVATE_SITE_PROVIDER_LINK_SELECTOR =
  process.env.PRIVATE_SITE_PROVIDER_LINK_SELECTOR || '';
const PRIVATE_SITE_STREAM_LINK_SELECTOR =
  process.env.PRIVATE_SITE_STREAM_LINK_SELECTOR || 'a[href], source[src], video[src]';
const PRIVATE_SITE_FINAL_STREAM_SELECTOR =
  process.env.PRIVATE_SITE_FINAL_STREAM_SELECTOR ||
  PRIVATE_SITE_STREAM_LINK_SELECTOR ||
  'a[href], iframe[src], source[src], video[src]';
const PRIVATE_SITE_FINAL_EMBED_SELECTOR =
  process.env.PRIVATE_SITE_FINAL_EMBED_SELECTOR || 'iframe[src]';
const PRIVATE_SITE_RESOLVE_PROVIDER_PAGES =
  String(process.env.PRIVATE_SITE_RESOLVE_PROVIDER_PAGES || '').toLowerCase() === 'true';
const PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED =
  String(process.env.PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED || 'true').toLowerCase() !== 'false';
const PRIVATE_SITE_MAX_EMBED_DEPTH = Math.max(
  0,
  Number(process.env.PRIVATE_SITE_MAX_EMBED_DEPTH || 3)
);
const PRIVATE_SITE_FETCH_RETRIES = Math.max(
  0,
  Number(process.env.PRIVATE_SITE_FETCH_RETRIES || 2)
);
const PRIVATE_SITE_MAX_PROVIDER_CANDIDATES = Math.max(
  1,
  Number(process.env.PRIVATE_SITE_MAX_PROVIDER_CANDIDATES || 12)
);
const PRIVATE_SITE_PROVIDER_RESOLVE_LIMIT = Math.max(
  1,
  Number(process.env.PRIVATE_SITE_PROVIDER_RESOLVE_LIMIT || 7)
);
const PRIVATE_SITE_PROVIDER_FETCH_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.PRIVATE_SITE_PROVIDER_FETCH_TIMEOUT_MS || 2500)
);
const PRIVATE_SITE_DETAIL_PAGE_FETCH_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.PRIVATE_SITE_DETAIL_PAGE_FETCH_TIMEOUT_MS || 3000)
);

function buildHeaders() {
  const headers = {
    Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  };

  if (RESOLVER_BEARER) {
    headers.Authorization = `Bearer ${RESOLVER_BEARER}`;
  }

  if (process.env.STREAM_RESOLVER_AUTH_HEADER_NAME && process.env.STREAM_RESOLVER_AUTH_HEADER_VALUE) {
    headers[process.env.STREAM_RESOLVER_AUTH_HEADER_NAME] = process.env.STREAM_RESOLVER_AUTH_HEADER_VALUE;
  }

  return headers;
}

function toAbsoluteUrl(url, baseUrl = PRIVATE_SITE_BASE_URL) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, baseUrl || 'http://localhost').toString();
  } catch {
    return String(url).trim();
  }
}

function normalizeStreamKind(kind, url) {
  const raw = String(kind || '').toLowerCase();
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

function normalizeStreams(payload) {
  const rawStreams = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.streams)
      ? payload.streams
      : Array.isArray(payload?.links)
        ? payload.links
        : [];

  return rawStreams
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
        provider: String(stream?.provider || stream?.source || 'Private Resolver'),
        quality: String(stream?.quality || stream?.resolution || 'Auto'),
        language: String(stream?.language || stream?.lang || 'English'),
        kind: normalizeStreamKind(stream?.type || stream?.kind, url),
        url,
        authorized: true,
        headers:
          stream?.headers && typeof stream.headers === 'object' && !Array.isArray(stream.headers)
            ? stream.headers
            : undefined,
        notes: typeof stream?.notes === 'string' ? stream.notes : undefined,
      };
    })
    .filter(Boolean);
}

async function fetchHtml(url, timeoutMs, maxRetries = PRIVATE_SITE_FETCH_RETRIES) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: buildHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Website request failed with status ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Website request failed');
}

function buildSearchUrl(match, resolverQuery) {
  if (!PRIVATE_SITE_SEARCH_URL_TEMPLATE) {
    return '';
  }

  const homeQuery = getPrimarySearchFragment(match?.homeTeam);
  const awayQuery = getPrimarySearchFragment(match?.awayTeam);
  const query =
    resolverQuery?.search ||
    [homeQuery, awayQuery].filter(Boolean).join(' ') ||
    resolverQuery?.title ||
    match.title;
  return PRIVATE_SITE_SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(String(query || '')));
}

function sanitizeId(input, fallback) {
  const normalized = String(input || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function normalizeCatalogStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (
    ['live', 'inplay', 'in-play', 'playing', 'active'].includes(raw) ||
    raw.includes('started') ||
    raw.includes('kick off') ||
    raw.includes('kickoff')
  ) {
    return 'live';
  }
  if (['ended', 'complete', 'completed', 'finished', 'closed'].includes(raw)) {
    return 'ended';
  }
  return 'upcoming';
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = String(candidate?.url || '').trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferProviderName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Private Website';
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSearchFragments(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }

  const genericTokens = new Set([
    'a',
    'ac',
    'af',
    'association',
    'c',
    'cf',
    'club',
    'de',
    'del',
    'deportivo',
    'do',
    'da',
    'fc',
    'football',
    'futbol',
    'rc',
    'sc',
    'team',
    'the',
  ]);
  const simplified = normalized
    .split(' ')
    .filter((token) => token && !genericTokens.has(token))
    .join(' ');

  return [...new Set([normalized, simplified].filter((fragment) => fragment && fragment.length >= 3))];
}

function getPrimarySearchFragment(value) {
  const fragments = getSearchFragments(value);
  const primary = fragments.at(-1) || fragments[0] || '';
  if (!primary) {
    return '';
  }

  const tokens = primary.split(' ').filter(Boolean);
  if (tokens.length > 2) {
    return tokens.slice(0, 2).join(' ');
  }

  return primary;
}

function scoreMatchCandidate(match, resolverQuery, haystack, index) {
  let score = index === 0 ? 1 : 0;

  const titleFragments = getSearchFragments(resolverQuery?.title || match.title);
  const homeFragments = getSearchFragments(match.homeTeam);
  const awayFragments = getSearchFragments(match.awayTeam);
  const leagueFragments = getSearchFragments(match.league);

  if (titleFragments.some((fragment) => haystack.includes(fragment))) {
    score += 80;
  }

  const matchedHome = homeFragments.some((fragment) => haystack.includes(fragment));
  const matchedAway = awayFragments.some((fragment) => haystack.includes(fragment));

  if (matchedHome) {
    score += 45;
  }
  if (matchedAway) {
    score += 45;
  }
  if (matchedHome && matchedAway) {
    score += 90;
  }

  if (leagueFragments.some((fragment) => haystack.includes(fragment))) {
    score += 10;
  }

  return score;
}

function isIgnoredEmbedUrl(url, pageUrl) {
  const normalizedUrl = toAbsoluteUrl(url, pageUrl);
  if (!normalizedUrl) {
    return true;
  }

  const lower = normalizedUrl.toLowerCase();
  if (
    /\.(?:avif|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(lower) ||
    lower.includes('blogger.googleusercontent.com/img/') ||
    lower.includes('youtube.com/live_chat') ||
    lower.includes('/online.php?c=') ||
    lower.includes('discord.com/widget') ||
    lower.includes('chat.whatsapp.com') ||
    lower.includes('whatsapp.com/channel') ||
    lower.includes('telegram.me/') ||
    lower.includes('t.me/') ||
    lower.includes('instagram.com/') ||
    lower.includes('facebook.com/sharer') ||
    lower.includes('facebook.com/share') ||
    lower.includes('twitter.com/share') ||
    lower.includes('x.com/intent/') ||
    lower.includes('linkedin.com/share') ||
    lower.includes('pinterest.com/pin/create') ||
    lower.includes('plus.google.com/share')
  ) {
    return true;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const parsedPageUrl = pageUrl ? new URL(toAbsoluteUrl(pageUrl, pageUrl)) : null;
    const path = parsedUrl.pathname.toLowerCase();

    if (
      path === '/' ||
      path.startsWith('/search') ||
      path.startsWith('/p/about') ||
      path.startsWith('/p/contact') ||
      path.startsWith('/p/dmca')
    ) {
      return true;
    }

    if (parsedPageUrl && parsedUrl.toString() === parsedPageUrl.toString()) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function readScopedText($root, selector, fallback = '') {
  if (selector) {
    const scoped = $root.find(selector).first().text().trim();
    if (scoped) {
      return scoped;
    }
  }
  return fallback;
}

function readPreviousContextText($, $root, selector) {
  if (!selector) {
    return '';
  }

  const previousSiblings = $root.prevAll().toArray();
  for (const sibling of previousSiblings) {
    const $sibling = $(sibling);
    if ($sibling.is(selector)) {
      const directText = $sibling.text().trim();
      if (directText) {
        return directText;
      }
    }

    const nestedText = $sibling.find(selector).first().text().trim();
    if (nestedText) {
      return nestedText;
    }
  }

  return '';
}

function parseTeamsFromTitle(title) {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { homeTeam: 'Home', awayTeam: 'Away' };
  }

  const parts = normalized.split(/\s+(?:vs|v)\.?\s+/i);
  if (parts.length >= 2) {
    return {
      homeTeam: parts[0].trim() || 'Home',
      awayTeam: parts.slice(1).join(' vs ').trim() || 'Away',
    };
  }

  return {
    homeTeam: normalized,
    awayTeam: 'Opponent',
  };
}

function extractEventIdFromUrl(url) {
  try {
    const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
    return pathSegments.findLast((segment) => /^\d+$/.test(segment)) || '';
  } catch {
    return '';
  }
}

function extractTeamNamesFromItem($, $root) {
  const candidates = [
    ...$root
      .find('img[alt]')
      .toArray()
      .map((element) => $(element).attr('alt') || ''),
    ...$root
      .find('.row .col-12')
      .toArray()
      .map((element) => $(element).text() || ''),
  ];

  const seen = new Set();
  return candidates
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter((value) => value && !/^logo$/i.test(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

function isGenericLogoUrl(url) {
  const normalized = String(url || '').toLowerCase();
  return !normalized || normalized.includes('/logo.svg') || normalized.endsWith('/logo.png');
}

function extractTeamLogosFromItem($, $root, pageUrl) {
  const mapLogo = (value) => {
    const absoluteUrl = toAbsoluteUrl(value, pageUrl || PRIVATE_SITE_BASE_URL);
    return isGenericLogoUrl(absoluteUrl) ? undefined : absoluteUrl;
  };

  const teamRowLogos = $root
    .find('.row .col-12 img[src]')
    .toArray()
    .map((element) => mapLogo($(element).attr('src') || ''))
    .slice(0, 2);

  if (teamRowLogos.length === 2) {
    return teamRowLogos;
  }

  const fallbackLogos = $root
    .find('img[src]')
    .toArray()
    .map((element) => mapLogo($(element).attr('src') || ''));

  return [fallbackLogos[0], fallbackLogos[1]];
}

function composeMatchTitle(homeTeam, awayTeam, fallback = '') {
  if (homeTeam && awayTeam) {
    return `${homeTeam} vs ${awayTeam}`;
  }
  return String(fallback || '').trim();
}

function normalizeCatalogScore(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || '';
}

function classifyLeagueCategory(league, title = '') {
  const source = `${league || ''} ${title || ''}`.toLowerCase();
  const normalizedLeague = String(league || '').replace(/\s+/g, ' ').trim();

  const definitions = [
    { test: /uefa.*champions|champions league|\bucl\b/, id: 'ucl', name: 'UCL', shortLabel: 'UCL', accent: '#3b82f6' },
    { test: /uefa.*europa|europa league|\buel\b/, id: 'uel', name: 'UEL', shortLabel: 'UEL', accent: '#f97316' },
    { test: /conference league|\bu e c l\b|\buecl\b/, id: 'uecl', name: 'UECL', shortLabel: 'UECL', accent: '#22c55e' },
    { test: /premier-league|premier league|\bepl\b|\bpl\b/, id: 'pl', name: 'Premier League', shortLabel: 'PL', accent: '#22c55e' },
    { test: /la-liga|la liga/, id: 'laliga', name: 'La Liga', shortLabel: 'LL', accent: '#f59e0b' },
    { test: /serie-a|serie a/, id: 'seriea', name: 'Serie A', shortLabel: 'SA', accent: '#38bdf8' },
    { test: /bundesliga/, id: 'bundesliga', name: 'Bundesliga', shortLabel: 'BUN', accent: '#ef4444' },
    { test: /ligue-1|ligue 1/, id: 'ligue1', name: 'Ligue 1', shortLabel: 'L1', accent: '#8b5cf6' },
    { test: /primeiraliga|primeira liga|liga portugal/, id: 'primeira', name: 'Primeira Liga', shortLabel: 'POR', accent: '#10b981' },
    { test: /eredi/i, id: 'eredi', name: 'Eredivisie', shortLabel: 'ERE', accent: '#f97316' },
    { test: /championship/, id: 'championship', name: 'Championship', shortLabel: 'EFL', accent: '#84cc16' },
    { test: /boxing/, id: 'boxing', name: 'Boxing', shortLabel: 'BOX', accent: '#ef4444' },
    { test: /ufc|mma|fight night/, id: 'ufc', name: 'UFC', shortLabel: 'UFC', accent: '#dc2626' },
    { test: /motogp/, id: 'motogp', name: 'MotoGP', shortLabel: 'MGP', accent: '#f43f5e' },
    { test: /\bf1\b|formula ?1|grand prix/, id: 'f1', name: 'F1', shortLabel: 'F1', accent: '#e11d48' },
    { test: /nba|basketball/, id: 'nba', name: 'Basketball', shortLabel: 'NBA', accent: '#f59e0b' },
    { test: /nfl|football/, id: 'nfl', name: 'NFL', shortLabel: 'NFL', accent: '#22c55e' },
    { test: /cricket|ipl|test match|odi|t20/, id: 'cricket', name: 'Cricket', shortLabel: 'CRI', accent: '#f59e0b' },
    { test: /tennis|atp|wta/, id: 'tennis', name: 'Tennis', shortLabel: 'TEN', accent: '#06b6d4' },
    { test: /important games|featured/, id: 'featured', name: 'Featured', shortLabel: 'TOP', accent: '#2dd4bf' },
  ];

  const definition = definitions.find((entry) => entry.test.test(source));
  if (definition) {
    return definition;
  }

  const fallbackName = normalizedLeague || PRIVATE_SITE_DEFAULT_SPORT_NAME;
  return {
    id: sanitizeId(fallbackName, PRIVATE_SITE_DEFAULT_SPORT_ID),
    name: fallbackName,
    shortLabel: fallbackName.slice(0, 3).toUpperCase() || PRIVATE_SITE_DEFAULT_SPORT_SHORT_LABEL,
    accent: PRIVATE_SITE_DEFAULT_SPORT_ACCENT,
  };
}

function extractCatalogMatchesFromHtml(html) {
  const $ = load(html);
  const itemSelector = PRIVATE_SITE_CATALOG_CARD_SELECTOR || PRIVATE_SITE_CATALOG_LINK_SELECTOR;
  const items = $(itemSelector).toArray().slice(0, PRIVATE_SITE_CATALOG_LIMIT);
  const matches = [];

  items.forEach((element, index) => {
    const $item = $(element);
    const $link =
      PRIVATE_SITE_CATALOG_CARD_SELECTOR && PRIVATE_SITE_CATALOG_LINK_SELECTOR
        ? $item.find(PRIVATE_SITE_CATALOG_LINK_SELECTOR).first()
        : $item;

    const href =
      $link.attr('href') ||
      $link.attr('data-href') ||
      $item.attr('href') ||
      $item.attr('data-href') ||
      '';

    const pageUrl = toAbsoluteUrl(href, PRIVATE_SITE_BASE_URL);
    if (!pageUrl) {
      return;
    }

    const teamNames = extractTeamNamesFromItem($, $item);
    const teamLogos = extractTeamLogosFromItem($, $item, PRIVATE_SITE_BASE_URL);
    const rawTitle =
      $item.attr('data-title') ||
      $link.attr('title') ||
      readScopedText($item, PRIVATE_SITE_CATALOG_TITLE_SELECTOR, $link.text().trim());
    const derivedTitle =
      rawTitle && /\s+(?:vs|v)\.?\s+/i.test(rawTitle)
        ? rawTitle
        : composeMatchTitle(teamNames[0], teamNames[1], rawTitle);

    if (!derivedTitle) {
      return;
    }

    const parsedTeams = parseTeamsFromTitle($item.attr('data-match-title') || derivedTitle);
    const homeTeam = $item.attr('data-home-team') || teamNames[0] || parsedTeams.homeTeam;
    const awayTeam = $item.attr('data-away-team') || teamNames[1] || parsedTeams.awayTeam;
    const title = composeMatchTitle(homeTeam, awayTeam, derivedTitle);
    const eventId =
      $item.attr('data-event-id') ||
      extractEventIdFromUrl(pageUrl) ||
      sanitizeId(title, `match-${index + 1}`);

    const sportId = sanitizeId(
      $item.attr('data-sport-id') || PRIVATE_SITE_DEFAULT_SPORT_ID,
      `sport-${index + 1}`
    );
    const sportName =
      $item.attr('data-sport-name') || PRIVATE_SITE_DEFAULT_SPORT_NAME;
    const league =
      $item.attr('data-league') ||
      readScopedText(
        $item,
        PRIVATE_SITE_CATALOG_LEAGUE_SELECTOR,
        readPreviousContextText($, $item, PRIVATE_SITE_CATALOG_LEAGUE_SELECTOR) ||
          PRIVATE_SITE_DEFAULT_LEAGUE
      );
    const category = classifyLeagueCategory(league, title);
    const round =
      $item.attr('data-round') ||
      readScopedText($item, PRIVATE_SITE_CATALOG_ROUND_SELECTOR, 'Featured');
    const venue =
      $item.attr('data-venue') ||
      readScopedText($item, PRIVATE_SITE_CATALOG_VENUE_SELECTOR, 'Venue pending');
    const kickoffLabel =
      $item.attr('data-kickoff') ||
      readScopedText($item, PRIVATE_SITE_CATALOG_KICKOFF_SELECTOR, 'Schedule pending');
    const status = normalizeCatalogStatus(
      $item.attr('data-status') ||
        readScopedText($item, PRIVATE_SITE_CATALOG_STATUS_SELECTOR, '')
    );
    const scoreLine =
      normalizeCatalogScore(
        $item.attr('data-score') ||
        readScopedText($item, PRIVATE_SITE_CATALOG_SCORE_SELECTOR, '')
      );
    const summary =
      $item.attr('data-summary') ||
      readScopedText(
        $item,
        PRIVATE_SITE_CATALOG_SUMMARY_SELECTOR,
        'Catalog entry imported from the configured private source.'
      );
    const minuteLabel = $item.attr('data-minute') || undefined;

    matches.push({
      id: sanitizeId(eventId, `match-${index + 1}`),
      sportId:
        $item.attr('data-sport-id') ||
        (sportId === PRIVATE_SITE_DEFAULT_SPORT_ID ? category.id : sportId),
      sportName:
        $item.attr('data-sport-name') ||
        (sportName === PRIVATE_SITE_DEFAULT_SPORT_NAME ? category.name : sportName),
      league,
      round,
      title,
      summary,
      venue,
      status,
      kickoffLabel,
      minuteLabel,
      scoreLine,
      homeTeam,
      awayTeam,
      homeLogoUrl: $item.attr('data-home-logo') || teamLogos[0] || undefined,
      awayLogoUrl: $item.attr('data-away-logo') || teamLogos[1] || undefined,
      tags: ['External Source'],
      streamCountHint: Number($item.attr('data-stream-count') || 0) || undefined,
      resolverQuery: {
        eventId,
        title,
        search: title,
        pageUrl,
      },
    });
  });

  return dedupeCandidates(
    matches.map((match) => ({ url: match.resolverQuery.pageUrl, ...match }))
  ).map(({ url: _url, ...match }) => match);
}

function buildCatalogSports(matches) {
  const derivedSports = [];
  const seen = new Set();

  matches.forEach((match) => {
    if (seen.has(match.sportId)) {
      return;
    }
    seen.add(match.sportId);
    const category = classifyLeagueCategory(match.league, match.title);
    derivedSports.push({
      id: match.sportId,
      name: match.sportName || category.name || PRIVATE_SITE_DEFAULT_SPORT_NAME,
      accent: category.accent || PRIVATE_SITE_DEFAULT_SPORT_ACCENT,
      shortLabel:
        category.shortLabel ||
        match.sportName?.slice(0, 3).toUpperCase() ||
        PRIVATE_SITE_DEFAULT_SPORT_SHORT_LABEL,
    });
  });

  return [
    { id: 'all', name: 'All Sports', accent: '#2dd4bf', shortLabel: 'ALL' },
    ...derivedSports,
  ];
}

function extractMatchPageCandidates(html, match, resolverQuery) {
  const $ = load(html);
  const candidates = [];

  $(PRIVATE_SITE_MATCH_LINK_SELECTOR).each((index, element) => {
    const href =
      $(element).attr('href') ||
      $(element).attr('data-href') ||
      $(element).attr('data-url') ||
      '';
    const text = $(element).text().trim();
    const absolute = toAbsoluteUrl(href);

    if (!absolute) {
      return;
    }

    const haystack = normalizeSearchText(`${text} ${absolute}`);
    const score = scoreMatchCandidate(match, resolverQuery, haystack, index);
    candidates.push({ url: absolute, score });
  });

  candidates.sort((left, right) => right.score - left.score);
  return dedupeCandidates(candidates).map((entry) => entry.url);
}

function extractProviderPageCandidates(html, pageUrl) {
  if (!PRIVATE_SITE_PROVIDER_LINK_SELECTOR) {
    return [];
  }

  const $ = load(html);
  const candidates = [];

  $(PRIVATE_SITE_PROVIDER_LINK_SELECTOR).each((index, element) => {
    const rawUrl =
      $(element).attr('href') ||
      $(element).attr('src') ||
      $(element).attr('data-url') ||
      $(element).attr('data-stream') ||
      '';
    const url = toAbsoluteUrl(rawUrl, pageUrl);
    if (!url) {
      return;
    }

    const rowColumns = $(element)
      .find('.row')
      .first()
      .children('[class*="col-"]')
      .toArray()
      .map((column) => $(column).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const providerLabel =
      $(element).attr('data-provider') ||
      rowColumns[0] ||
      inferProviderName(url);
    const label =
      $(element).attr('title') ||
      $(element).attr('data-label') ||
      rowColumns[1] ||
      $(element).text().replace(/\s+/g, ' ').trim() ||
      `Provider ${index + 1}`;

    candidates.push({
      id: `provider-${index + 1}`,
      label,
      provider: providerLabel,
      quality: $(element).attr('data-quality') || rowColumns[3] || 'Auto',
      language: $(element).attr('data-language') || rowColumns[5] || 'English',
      type: 'embed',
      url,
    });
  });

  return dedupeCandidates(candidates).slice(0, PRIVATE_SITE_MAX_PROVIDER_CANDIDATES);
}

function extractInlineMediaCandidates(html, pageUrl) {
  const matches = html.match(/https?:\/\/[^"' )]+?\.(m3u8|mpd|mp4)(\?[^"' )]*)?/gi) || [];
  return dedupeCandidates(
    matches.map((match, index) => ({
      id: `inline-stream-${index + 1}`,
      label: `Feed ${index + 1}`,
      provider: inferProviderName(match),
      quality: 'Auto',
      language: 'English',
      type: normalizeStreamKind('', match),
      url: toAbsoluteUrl(match, pageUrl),
    }))
  );
}

function extractDirectStreamCandidates(html, pageUrl) {
  const $ = load(html);
  const results = [];

  $(PRIVATE_SITE_FINAL_STREAM_SELECTOR).each((index, element) => {
    const rawUrl =
      $(element).attr('href') ||
      $(element).attr('src') ||
      $(element).attr('data-url') ||
      $(element).attr('data-stream') ||
      '';

    const normalizedUrl = toAbsoluteUrl(rawUrl, pageUrl);
    if (!normalizedUrl) {
      return;
    }

    const lower = normalizedUrl.toLowerCase();
    if (!lower.includes('.m3u8') && !lower.includes('.mpd') && !lower.includes('.mp4')) {
      return;
    }

    results.push({
      id: `html-stream-${index + 1}`,
      label: $(element).attr('title') || $(element).text().trim() || `Feed ${index + 1}`,
      provider: 'Private Website',
      quality: $(element).attr('data-quality') || 'Auto',
      language: $(element).attr('data-language') || 'English',
      type: lower.includes('.mpd') ? 'dash' : lower.includes('.mp4') ? 'mp4' : 'hls',
      url: normalizedUrl,
    });
  });

  return dedupeCandidates(results.concat(extractInlineMediaCandidates(html, pageUrl)));
}

function extractEmbedCandidates(html, pageUrl) {
  const $ = load(html);
  const candidates = [];

  $(PRIVATE_SITE_FINAL_EMBED_SELECTOR).each((index, element) => {
    const rawUrl =
      $(element).attr('src') ||
      $(element).attr('href') ||
      $(element).attr('data-url') ||
      '';
    const url = toAbsoluteUrl(rawUrl, pageUrl);
    if (!url || isIgnoredEmbedUrl(url, pageUrl)) {
      return;
    }

    candidates.push({
      id: `embed-${index + 1}`,
      label: $(element).attr('title') || `Embed ${index + 1}`,
      provider: inferProviderName(url),
      quality: 'Auto',
      language: 'English',
      type: 'embed',
      url,
    });
  });

  return dedupeCandidates(candidates);
}

function isGenericCandidateLabel(label) {
  const normalized = String(label || '').trim().toLowerCase();
  return (
    !normalized ||
    /^feed \d+$/.test(normalized) ||
    /^embed \d+$/.test(normalized) ||
    normalized === 'playable page'
  );
}

function extractPlayableCandidatesFromHtml(html, pageUrl) {
  const directStreams = extractDirectStreamCandidates(html, pageUrl);
  if (directStreams.length > 0) {
    return directStreams;
  }

  const embeds = extractEmbedCandidates(html, pageUrl);
  if (embeds.length > 0) {
    return embeds;
  }

  if (PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED && pageUrl) {
    return [
      {
        id: 'page-embed-1',
        label: 'Playable Page',
        provider: inferProviderName(pageUrl),
        quality: 'Auto',
        language: 'English',
        type: 'embed',
        url: pageUrl,
      },
    ];
  }

  return [];
}

async function resolvePlayableCandidatesFromDocument(
  html,
  pageUrl,
  timeoutMs,
  depth = 0,
  visited = new Set()
) {
  const normalizedPageUrl = toAbsoluteUrl(pageUrl, pageUrl);
  if (!normalizedPageUrl || visited.has(normalizedPageUrl)) {
    return [];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(normalizedPageUrl);

  const directStreams = extractDirectStreamCandidates(html, normalizedPageUrl);
  if (directStreams.length > 0) {
    return directStreams;
  }

  const embeds = extractEmbedCandidates(html, normalizedPageUrl);
  if (embeds.length > 0) {
    if (depth < PRIVATE_SITE_MAX_EMBED_DEPTH) {
      const nestedGroups = await Promise.all(
        embeds.map(async (embedCandidate) => {
          try {
            const nestedHtml = await fetchHtml(embedCandidate.url, timeoutMs, 0);
            const nestedCandidates = await resolvePlayableCandidatesFromDocument(
              nestedHtml,
              embedCandidate.url,
              timeoutMs,
              depth + 1,
              nextVisited
            );

            if (nestedCandidates.length === 0) {
              return [];
            }

            return nestedCandidates.map((candidate) => ({
              ...candidate,
              label: isGenericCandidateLabel(candidate.label)
                ? embedCandidate.label
                : `${embedCandidate.label} • ${candidate.label}`,
            }));
          } catch {
            return [];
          }
        })
      );

      const nestedCandidates = dedupeCandidates(nestedGroups.flat());
      if (nestedCandidates.length > 0) {
        return nestedCandidates;
      }
    }

    return embeds;
  }

  if (PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED && normalizedPageUrl) {
    return [
      {
        id: `page-embed-${depth + 1}`,
        label: 'Playable Page',
        provider: inferProviderName(normalizedPageUrl),
        quality: 'Auto',
        language: 'English',
        type: 'embed',
        url: normalizedPageUrl,
      },
    ];
  }

  return [];
}

async function resolveProviderChoices(matchPageHtml, matchPageUrl, timeoutMs) {
  const providerCandidates = extractProviderPageCandidates(matchPageHtml, matchPageUrl);

  if (providerCandidates.length === 0) {
    return normalizeStreams(
      await resolvePlayableCandidatesFromDocument(matchPageHtml, matchPageUrl, timeoutMs)
    );
  }

  if (!PRIVATE_SITE_RESOLVE_PROVIDER_PAGES) {
    return normalizeStreams(providerCandidates);
  }

  const providerCandidatesToResolve = providerCandidates.slice(0, PRIVATE_SITE_PROVIDER_RESOLVE_LIMIT);
  const providerFetchTimeoutMs = Math.max(
    1000,
    Math.min(timeoutMs, PRIVATE_SITE_PROVIDER_FETCH_TIMEOUT_MS)
  );

  const resolvedGroups = await Promise.all(
    providerCandidatesToResolve.map(async (providerCandidate) => {
      try {
        const providerHtml = await fetchHtml(providerCandidate.url, providerFetchTimeoutMs, 0);
        const playableCandidates = await resolvePlayableCandidatesFromDocument(
          providerHtml,
          providerCandidate.url,
          providerFetchTimeoutMs
        );

        if (playableCandidates.length === 0) {
          return [];
        }

        return playableCandidates.map((candidate, index) => ({
          ...candidate,
          id: `${providerCandidate.id}-${index + 1}`,
          label:
            candidate.label && candidate.label !== `Feed ${index + 1}`
              ? `${providerCandidate.label} • ${candidate.label}`
              : providerCandidate.label,
          provider: providerCandidate.provider,
          quality: candidate.quality || providerCandidate.quality,
          language: candidate.language || providerCandidate.language,
        }));
      } catch {
        if (!PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED) {
          return [];
        }

        return [providerCandidate];
      }
    })
  );

  const resolvedStreams = normalizeStreams(resolvedGroups.flat());
  if (resolvedStreams.length > 0) {
    const unresolvedProviderFallbacks = normalizeStreams(
      providerCandidates.slice(providerCandidatesToResolve.length)
    );
    if (
      unresolvedProviderFallbacks.length > 0 &&
      resolvedStreams.length < PRIVATE_SITE_PROVIDER_RESOLVE_LIMIT
    ) {
      return dedupeCandidates(
        resolvedStreams.concat(
          unresolvedProviderFallbacks.slice(
            0,
            PRIVATE_SITE_PROVIDER_RESOLVE_LIMIT - resolvedStreams.length
          )
        )
      );
    }

    return resolvedStreams;
  }

  return normalizeStreams(providerCandidates);
}

async function resolveFromWebsite(match, resolverQuery, timeoutMs) {
  const detailPageUrl = resolverQuery?.pageUrl ? toAbsoluteUrl(resolverQuery.pageUrl) : '';
  let candidatePageUrl = detailPageUrl;

  if (!candidatePageUrl) {
    const searchUrl = buildSearchUrl(match, resolverQuery) || PRIVATE_SITE_BASE_URL;
    if (!searchUrl) {
      throw new Error('No detail page URL, PRIVATE_SITE_SEARCH_URL_TEMPLATE, or PRIVATE_SITE_BASE_URL is configured');
    }

    const searchHtml = await fetchHtml(searchUrl, timeoutMs);
    const candidates = extractMatchPageCandidates(searchHtml, match, resolverQuery);
    candidatePageUrl = candidates[0] || '';
  }

  if (!candidatePageUrl && PRIVATE_SITE_FALLBACK_PAGE_URL) {
    candidatePageUrl = toAbsoluteUrl(PRIVATE_SITE_FALLBACK_PAGE_URL);
  }

  if (!candidatePageUrl) {
    throw new Error('Could not locate a matching event page on the private website');
  }

  const detailPageFetchTimeoutMs = Math.max(
    1000,
    Math.min(timeoutMs, PRIVATE_SITE_DETAIL_PAGE_FETCH_TIMEOUT_MS)
  );

  try {
    const matchPageHtml = await fetchHtml(candidatePageUrl, detailPageFetchTimeoutMs, 0);
    const resolvedStreams = await resolveProviderChoices(
      matchPageHtml,
      candidatePageUrl,
      detailPageFetchTimeoutMs
    );

    if (resolvedStreams.length > 0) {
      return resolvedStreams;
    }
  } catch {
    if (!PRIVATE_SITE_FALLBACK_TO_PAGE_EMBED) {
      throw new Error('Could not resolve streams from the private website');
    }
  }

  return normalizeStreams([
    {
      id: `match-page-${match.id || '1'}`,
      label: 'Match Page',
      provider: inferProviderName(candidatePageUrl),
      quality: 'Auto',
      language: 'English',
      type: 'embed',
      url: candidatePageUrl,
    },
  ]);
}

export async function loadPrivateCatalog({ timeoutMs }) {
  if (!PRIVATE_SITE_BASE_URL) {
    throw new Error('PRIVATE_SITE_BASE_URL must be configured to load the private catalog');
  }

  const html = await fetchHtml(PRIVATE_SITE_BASE_URL, timeoutMs);
  const matches = extractCatalogMatchesFromHtml(html);

  if (matches.length === 0) {
    throw new Error('Could not extract any matches from the configured private catalog page');
  }

  return {
    sports: buildCatalogSports(matches),
    matches,
  };
}

export async function resolvePrivateStreams({ match, resolverQuery, timeoutMs }) {
  if (!RESOLVER_URL && !PRIVATE_SITE_BASE_URL && !resolverQuery?.pageUrl) {
    throw new Error(
      'Set STREAM_RESOLVER_URL for a JSON resolver, or configure PRIVATE_SITE_BASE_URL / PRIVATE_SITE_SEARCH_URL_TEMPLATE for website extraction'
    );
  }

  if (!RESOLVER_URL) {
    return resolveFromWebsite(match, resolverQuery, timeoutMs);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(RESOLVER_URL, {
      method: 'POST',
      headers: buildHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        match,
        resolverQuery,
      }),
    });

    if (!response.ok) {
      throw new Error(`Private resolver failed with status ${response.status}`);
    }

    const payload = await response.json();
    return normalizeStreams(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}
