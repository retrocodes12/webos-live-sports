import 'dotenv/config'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10)
const HOST = process.env.HOST?.trim() || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1')
const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY ?? '123'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION ?? '2023-06-01'
const DIST_DIR = path.join(__dirname, 'dist')
const SPORTSDB_CACHE_TTL_MS = 2 * 60 * 1000
const STANDINGS_CACHE_TTL_MS = 15 * 60 * 1000
const STREAMS_CACHE_TTL_MS = 10 * 60 * 1000
const SPORTZX_STREAM_LOOKUP_TIMEOUT_MS = 2200
const STREAM_RESOLVE_TIMEOUT_MS = 2200
const SPORTZX_API_BASE_URL = 'https://sportzx-api.onrender.com'
const AGGREGATE_SPORTSDB_LEAGUES = ['4328', '4335']
const SPORTZX_SPORT_DISPLAY = {
  worldcupqualifying: { name: 'World Cup', short: 'WC', flag: '🌍', order: 10 },
  nba: { name: 'NBA', short: 'NBA', flag: '🏀', order: 20 },
  nhl: { name: 'NHL', short: 'NHL', flag: '🏒', order: 30 },
  mlb: { name: 'MLB', short: 'MLB', flag: '⚾', order: 40 },
  cricket: { name: 'Cricket', short: 'CR', flag: '🏏', order: 50 },
  tennis: { name: 'Tennis', short: 'TN', flag: '🎾', order: 60 },
  rugby: { name: 'Rugby', short: 'RU', flag: '🏉', order: 70 },
  wwe: { name: 'WWE', short: 'WWE', flag: '🎭', order: 80 },
  f1: { name: 'F1', short: 'F1', flag: '🏎', order: 90 },
  motogp: { name: 'MotoGP', short: 'MGP', flag: '🏍', order: 100 },
  'international-friendlies': { name: 'Friendlies', short: 'INT', flag: '🌐', order: 110 },
  'club-friendly': { name: 'Club Friendly', short: 'CF', flag: '🌐', order: 120 },
  'copa-argentina': { name: 'Copa Argentina', short: 'CA', flag: '🇦🇷', order: 130 },
  'japan-j1-league': { name: 'J1 League', short: 'J1', flag: '🇯🇵', order: 140 },
  laliga: { name: 'La Liga', short: 'LL', flag: '🇪🇸', order: 150 },
}

const responseCache = new Map()
const inflightRequests = new Map()

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(message)
}

function getCachedEntry(key, ttlMs) {
  const entry = responseCache.get(key)
  if (!entry) {
    return null
  }

  if (Date.now() - entry.timestamp > ttlMs) {
    return null
  }

  return entry
}

function setCachedEntry(key, payload) {
  responseCache.set(key, {
    timestamp: Date.now(),
    payload,
  })
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (!chunks.length) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function proxySportsDb(requestUrl, response) {
  const upstreamPath = requestUrl.pathname.replace(/^\/api\/sportsdb\//, '')
  const upstreamUrl = new URL(
    `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/${upstreamPath}`,
  )

  upstreamUrl.search = requestUrl.search
  const cacheKey = upstreamUrl.toString()
  const fresh = getCachedEntry(cacheKey, SPORTSDB_CACHE_TTL_MS)

  if (fresh) {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Cache': 'HIT',
    })
    response.end(fresh.payload)
    return
  }

  const inflight = inflightRequests.get(cacheKey)
  if (inflight) {
    const payload = await inflight
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Cache': 'DEDUPED',
    })
    response.end(payload)
    return
  }

  const requestPromise = (async () => {
    const upstreamResponse = await fetch(upstreamUrl)
    const text = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      const stale = responseCache.get(cacheKey)
      if (upstreamResponse.status === 429 && stale?.payload) {
        return stale.payload
      }
      throw new Error(text || `SportsDB error ${upstreamResponse.status}`)
    }

    setCachedEntry(cacheKey, text)
    return text
  })()

  inflightRequests.set(cacheKey, requestPromise)

  try {
    const payload = await requestPromise
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Cache': 'MISS',
    })
    response.end(payload)
  } finally {
    inflightRequests.delete(cacheKey)
  }
}

function normalizeClaudeText(text) {
  const trimmed = text.trim()

  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }

  return trimmed
}

function normalizeStandingRow(row, fallbackBadgeMap) {
  const name = typeof row?.strTeam === 'string' ? row.strTeam.trim() : ''
  const goalsFor = String(row?.intGoalsFor ?? '0')
  const goalsAgainst = String(row?.intGoalsAgainst ?? '0')
  const fallback = fallbackBadgeMap.get(name.toLowerCase())

  return {
    idTeam: fallback?.idTeam,
    strTeam: name,
    strBadge: fallback?.strBadge ?? null,
    intPlayed: String(row?.intPlayed ?? '0'),
    intWin: String(row?.intWin ?? '0'),
    intDraw: String(row?.intDraw ?? '0'),
    intLoss: String(row?.intLoss ?? '0'),
    intGoalsFor: goalsFor,
    intGoalsAgainst: goalsAgainst,
    intGoalDifference: String(
      row?.intGoalDifference ??
        (Number.parseInt(goalsFor, 10) || 0) - (Number.parseInt(goalsAgainst, 10) || 0),
    ),
    intPoints: String(row?.intPoints ?? '0'),
    strForm:
      typeof row?.strForm === 'string'
        ? row.strForm
            .toUpperCase()
            .replace(/[^WDL]/g, '')
            .slice(0, 5)
        : '',
  }
}

async function fetchSportsDbTable(leagueId, season) {
  if (!leagueId) {
    return []
  }

  const url = new URL(
    `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/lookuptable.php`,
  )
  url.searchParams.set('l', leagueId)
  url.searchParams.set('s', season)

  const response = await fetch(url)
  if (!response.ok) {
    return []
  }

  const payload = await response.json()
  return Array.isArray(payload?.table) ? payload.table : []
}

async function fetchSportsDbJson(endpoint, params = {}) {
  const url = new URL(
    `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/${endpoint}`,
  )

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const cacheKey = `sportsdb-json:${url.toString()}`
  const cached = getCachedEntry(cacheKey, SPORTSDB_CACHE_TTL_MS)
  if (cached) {
    return cached.payload
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`SportsDB request failed for ${endpoint} (${response.status})`)
  }

  const payload = await response.json()
  setCachedEntry(cacheKey, payload)
  return payload
}

async function fetchSportsDbEvent(eventId) {
  const url = new URL(
    `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/lookupevent.php`,
  )
  url.searchParams.set('id', eventId)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to fetch match details (${response.status})`)
  }

  const payload = await response.json()
  return payload?.events?.[0] ?? null
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|club|deportivo|football|team|women|men|u\d{2})\b/g, ' ')
    .replace(/wanderers/g, '')
    .replace(/united/g, '')
    .replace(/city/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCurrentSeasonLabel(date = new Date()) {
  const currentYear = date.getFullYear()
  const startYear = date.getMonth() >= 6 ? currentYear : currentYear - 1
  return `${startYear}-${startYear + 1}`
}

function tokenizeName(value) {
  return normalizeName(value)
    .split(' ')
    .filter(Boolean)
}

function overlapScore(left, right) {
  const leftTokens = tokenizeName(left)
  const rightTokens = new Set(tokenizeName(right))
  if (!leftTokens.length || !rightTokens.size) {
    return 0
  }

  let score = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      score += 1
    }
  }
  return score
}

function normalizeLeague(value) {
  return normalizeName(value)
}

function titleizeSport(value) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function parseHostname(value) {
  try {
    return new URL(String(value ?? '')).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function toProviderName(value) {
  const hostname = parseHostname(value).replace(/^www\./, '')
  return hostname || 'Unknown'
}

function normalizeStreamOption(stream, fallbackId) {
  return {
    id: String(stream?.id ?? fallbackId),
    label: String(stream?.label ?? stream?.provider ?? 'Source'),
    provider: String(stream?.provider ?? 'Unknown'),
    quality: String(stream?.quality ?? 'Auto'),
    language: String(stream?.language ?? 'Unknown'),
    kind:
      stream?.kind === 'hls' || stream?.kind === 'dash' || stream?.kind === 'mp4' || stream?.kind === 'embed'
        ? stream.kind
        : 'embed',
    url: String(stream?.url ?? ''),
    authorized: Boolean(stream?.authorized),
    drm: stream?.drm ? Boolean(stream.drm) : false,
    notes: typeof stream?.notes === 'string' ? stream.notes : '',
    headers:
      stream?.headers && typeof stream.headers === 'object'
        ? Object.fromEntries(
            Object.entries(stream.headers).map(([key, value]) => [key, String(value)]),
          )
        : {},
  }
}

function inferStreamKind(url) {
  const lower = String(url ?? '').toLowerCase()
  if (lower.includes('.m3u8')) {
    return 'hls'
  }
  if (lower.includes('.mpd')) {
    return 'dash'
  }
  if (lower.match(/\.(mp4|m4v)(\?|$)/)) {
    return 'mp4'
  }
  return 'embed'
}

function shouldResolveMatchPage(streams) {
  if (!Array.isArray(streams) || streams.length !== 1) {
    return false
  }

  const [stream] = streams
  const hostname = parseHostname(stream?.url)
  return (
    (hostname === 'totalsportek.army' || hostname === 'totalsportekarmy.com') &&
    /\/game\//i.test(String(stream?.url ?? ''))
  )
}

async function fetchHtmlDocument(url) {
  const attempts = 0

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), STREAM_RESOLVE_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Referer: url,
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
      })

      if (!response.ok) {
        throw new Error(`Match page request failed (${response.status})`)
      }

      return await response.text()
    } catch (error) {
      if (attempt >= attempts) {
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw new Error('Match page request failed')
}

function extractResolvedStreams(matchPageUrl, html) {
  const rawUrls = [...new Set(String(html ?? '').match(/https?:[^"'`\s)<>]+/g) ?? [])]
  const seen = new Set()
  const resolved = []

  for (const candidateUrl of rawUrls) {
    const normalizedUrl = candidateUrl.replace(/&amp;/g, '&')
    const hostname = parseHostname(normalizedUrl)
    const lowerUrl = normalizedUrl.toLowerCase()

    if (!hostname || normalizedUrl === matchPageUrl) {
      continue
    }

    if (
      /(^|\.)(schema\.org|w3\.org|fonts\.googleapis\.com|fonts\.gstatic\.com|googletagmanager\.com|doubleclick\.net|googlesyndication\.com|cloudflare\.com)$/i.test(
        hostname,
      )
    ) {
      continue
    }

    if (
      hostname === 'totalsportek.army' ||
      hostname === 'totalsportekarmy.com'
    ) {
      if (!/\/game\//i.test(lowerUrl)) {
        continue
      }
    }

    if (
      /\/(assets|images|css|js)\//i.test(lowerUrl) ||
      /\.(css|js|svg|png|jpg|jpeg|gif|webp|woff2?|ttf)(\?|$)/i.test(lowerUrl) ||
      /\/team\//i.test(lowerUrl)
    ) {
      continue
    }

    if (
      !/(stream|live|embed|player|m3u8|mpd|\.php(\?|$)|1ststream|papashd|buffstreamz|streamrush|worldstreams|specialstreams|faststreams|topstreams|footballstream|daddylivestream|prostreams)/i.test(
        lowerUrl,
      )
    ) {
      continue
    }

    if (seen.has(normalizedUrl)) {
      continue
    }
    seen.add(normalizedUrl)

    resolved.push({
      id: `resolved-${resolved.length + 1}`,
      label: `Source ${resolved.length + 1}`,
      provider: toProviderName(normalizedUrl),
      quality: 'Auto',
      language: 'English',
      kind: inferStreamKind(normalizedUrl),
      url: normalizedUrl,
      authorized: true,
      drm: false,
      notes: 'Resolved from match page',
      headers: {},
    })
  }

  return resolved
}

function extractPublishedEmbedUrl(url, html) {
  const hostname = parseHostname(url)
  const text = String(html ?? '')

  if (hostname === 'fsportshds.xyz' || hostname === 'fsportshd.xyz') {
    const embedMatch = text.match(/https:\/\/fsportshd\.xyz\/embed\/[^"'`\s<>&]+/i)
    if (embedMatch?.[0]) {
      return embedMatch[0].replace(/&quot;$/i, '')
    }
  }

  return null
}

function shouldUpgradeProviderPage(url) {
  const hostname = parseHostname(url)
  const lowerUrl = String(url ?? '').toLowerCase()

  if (!hostname) {
    return false
  }

  if (hostname === 'fsportshds.xyz' || hostname === 'fsportshd.xyz') {
    return true
  }

  if (
    hostname === '1ststream.space' ||
    hostname === '4kstreams.lol' ||
    hostname === 'papashd.onl' ||
    hostname === 'papashd.pro' ||
    hostname === 'prostreams.su' ||
    hostname === 'worldstreams.ru' ||
    hostname === 'streamrush.ru' ||
    hostname === 'topstreams.pro' ||
    hostname === 'footballstream.site' ||
    hostname === 'specialstreams.online' ||
    hostname === 'faststreams.site' ||
    hostname === 'sportsmaster.space'
  ) {
    return true
  }

  if (hostname === 'daddylivestream.live' && !/\/embed\//i.test(lowerUrl)) {
    return true
  }

  return /\?p=\d+/i.test(lowerUrl)
}

function getNestedStreamRank(url, parentHostname) {
  const hostname = parseHostname(url)
  const lowerUrl = String(url ?? '').toLowerCase()
  let rank = 0

  if (!hostname) {
    return 10_000
  }

  if (hostname === parentHostname) {
    rank += 25
  }

  if (/\/embed\//i.test(lowerUrl)) {
    rank -= 35
  }

  if (/\/stream\//i.test(lowerUrl)) {
    rank -= 30
  }

  if (/source\/fetch\.php/i.test(lowerUrl)) {
    rank -= 28
  }

  if (/\/new\/stream-/i.test(lowerUrl)) {
    rank -= 26
  }

  if (/\/stream-\d+\.php/i.test(lowerUrl)) {
    rank -= 24
  }

  if (hostname === 'streams.center') {
    rank -= 24
  }

  if (hostname === 'embedhd.org') {
    rank -= 24
  }

  if (hostname === '1ststreams.shop' || hostname === '4kstreamz.shop') {
    rank -= 22
  }

  if (/\/game\//i.test(lowerUrl) && (hostname === 'totalsportek.army' || hostname === 'totalsportekarmy.com')) {
    rank += 50
  }

  return rank
}

function extractNestedProviderUrl(url, html) {
  const parentHostname = parseHostname(url)
  const candidates = extractResolvedStreams(url, html)

  if (!candidates.length) {
    return null
  }

  const [bestCandidate] = [...candidates].sort((left, right) => {
    const rankDelta = getNestedStreamRank(left.url, parentHostname) - getNestedStreamRank(right.url, parentHostname)
    if (rankDelta !== 0) {
      return rankDelta
    }

    return String(left.url ?? '').localeCompare(String(right.url ?? ''))
  })

  return bestCandidate?.url ?? null
}

function getStreamRank(stream) {
  const hostname = parseHostname(stream?.url)
  let rank = 0

  if (/^live\d+\.totalsportek\.foo$/i.test(hostname)) {
    rank += 40
  }

  if (hostname === 'totalsportek.army' || hostname === 'totalsportekarmy.com') {
    rank += 60
  }

  if (hostname === 'fsportshds.xyz') {
    rank += 10
  }

  if (stream?.notes?.includes('Published embed target')) {
    rank -= 25
  }

  return rank
}

function rankStreams(streams) {
  return [...streams].sort((left, right) => {
    const rankDelta = getStreamRank(left) - getStreamRank(right)
    if (rankDelta !== 0) {
      return rankDelta
    }

    return String(left.provider ?? '').localeCompare(String(right.provider ?? ''))
  })
}

async function resolveStreamLookup(streamLookup, idPrefix) {
  const normalizedStreams = (Array.isArray(streamLookup?.streams) ? streamLookup.streams : [])
    .map((stream, index) => normalizeStreamOption(stream, `${idPrefix}:${index}`))
    .filter((stream) => stream.url)
  const baseMessage = typeof streamLookup?.message === 'string' ? streamLookup.message : ''

  if (!shouldResolveMatchPage(normalizedStreams)) {
    return {
      streams: normalizedStreams,
      pending: Boolean(streamLookup?.pending),
      message: baseMessage,
    }
  }

  const matchPage = normalizedStreams[0]
  const resolvedCacheKey = `resolved-streams:${matchPage.url}`
  const cachedResolved = getCachedEntry(resolvedCacheKey, STREAMS_CACHE_TTL_MS)

  if (cachedResolved) {
    return {
      streams: cachedResolved.payload,
      pending: false,
      message: baseMessage,
    }
  }

  try {
    const html = await fetchHtmlDocument(matchPage.url)
    const resolvedStreams = extractResolvedStreams(matchPage.url, html)
    if (resolvedStreams.length) {
      const upgradedStreams = []

      for (const stream of resolvedStreams) {
        if (shouldUpgradeProviderPage(stream.url)) {
          try {
            const providerHtml = await fetchHtmlDocument(stream.url)
            const embedUrl = extractPublishedEmbedUrl(stream.url, providerHtml)
            const nestedUrl = extractNestedProviderUrl(stream.url, providerHtml)
            const upgradedUrl = embedUrl || nestedUrl

            if (upgradedUrl) {
              upgradedStreams.push({
                ...stream,
                provider: toProviderName(upgradedUrl),
                url: upgradedUrl,
                notes: embedUrl ? 'Published embed target' : 'Resolved inner player',
              })
              continue
            }
          } catch {
            // Keep original source when provider refinement fails.
          }
        }

        upgradedStreams.push(stream)
      }

      const streams = rankStreams([
        ...upgradedStreams,
        {
          ...matchPage,
          notes: matchPage.notes || 'Fallback match page',
        },
      ])
      setCachedEntry(resolvedCacheKey, streams)
      return {
        streams,
        pending: false,
        message: baseMessage,
      }
    }
  } catch {
    return {
      streams: normalizedStreams,
      pending: true,
      message: 'Primary stream page is ready. Additional sources are still resolving.',
    }
  }

  return {
    streams: normalizedStreams,
    pending: Boolean(streamLookup?.pending),
    message: baseMessage,
  }
}

async function fetchSportzxCatalog() {
  const cacheKey = 'sportzx:catalog'
  const cached = getCachedEntry(cacheKey, STREAMS_CACHE_TTL_MS)
  if (cached) {
    return cached.payload
  }

  const response = await fetch(new URL('/catalog', `${SPORTZX_API_BASE_URL}/`))
  if (!response.ok) {
    throw new Error(`SportZX catalog error ${response.status}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.matches)) {
    throw new Error('SportZX catalog payload is invalid')
  }

  setCachedEntry(cacheKey, payload)
  return payload
}

async function fetchSportzxStreams(matchId) {
  const cacheKey = `sportzx:streams:${matchId}`
  const cached = getCachedEntry(cacheKey, STREAMS_CACHE_TTL_MS)
  if (cached) {
    return cached.payload
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SPORTZX_STREAM_LOOKUP_TIMEOUT_MS)
  const response = await fetch(
    new URL(`/matches/${encodeURIComponent(matchId)}/streams`, `${SPORTZX_API_BASE_URL}/`),
    { signal: controller.signal },
  ).finally(() => clearTimeout(timeoutId))
  if (!response.ok) {
    throw new Error(`SportZX streams error ${response.status}`)
  }

  const payload = await response.json()
  const normalized = Array.isArray(payload) ? { streams: payload } : payload
  if (!normalized || typeof normalized !== 'object' || !Array.isArray(normalized.streams)) {
    throw new Error('SportZX streams payload is invalid')
  }

  setCachedEntry(cacheKey, normalized)
  return normalized
}

function buildFallbackMatchPageLookup(matchId, pageUrl) {
  if (!pageUrl) {
    return null
  }

  return {
    streams: [
      {
        id: `match-page-${matchId}`,
        label: 'Match Page',
        provider: toProviderName(pageUrl),
        quality: 'Auto',
        language: 'English',
        kind: 'embed',
        url: pageUrl,
        authorized: true,
        drm: false,
        notes: '',
        headers: {},
      },
    ],
    pending: true,
    message: 'Using the catalog match page while sources resolve.',
  }
}

function findSportzxMatchById(catalog, matchId) {
  const candidates = Array.isArray(catalog?.matches) ? catalog.matches : []
  return candidates.find((candidate) => String(candidate?.id ?? '') === String(matchId)) ?? null
}

function findSportzxMatch(catalog, match) {
  const targetLeague = normalizeLeague(match?.strLeague)
  const candidates = Array.isArray(catalog?.matches) ? catalog.matches : []

  const ranked = candidates
    .map((candidate) => {
      const homeScore = overlapScore(match?.strHomeTeam, candidate?.homeTeam)
      const awayScore = overlapScore(match?.strAwayTeam, candidate?.awayTeam)
      const reverseHomeScore = overlapScore(match?.strHomeTeam, candidate?.awayTeam)
      const reverseAwayScore = overlapScore(match?.strAwayTeam, candidate?.homeTeam)
      const directScore = homeScore + awayScore
      const reverseScore = reverseHomeScore + reverseAwayScore
      const bestPairScore = Math.max(directScore, reverseScore)
      const leagueScore = targetLeague && normalizeLeague(candidate?.league) === targetLeague ? 2 : 0
      const liveScore = candidate?.status === 'live' ? 1 : 0

      return {
        candidate,
        score: bestPairScore * 10 + leagueScore + liveScore,
      }
    })
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.score >= 20 ? ranked[0].candidate : null
}

function mapSportzxMatchToFrontend(match) {
  const today = new Date().toISOString().slice(0, 10)

  return {
    idEvent: null,
    streamLookupId: String(match?.id ?? ''),
    streamSource: 'sportzx',
    intRound: match?.round ?? null,
    strLeague: match?.league ?? match?.sportName ?? 'World Cup Qualifying',
    strSeason: getCurrentSeasonLabel(),
    strHomeTeam: match?.homeTeam ?? 'Home',
    strAwayTeam: match?.awayTeam ?? 'Away',
    strHomeTeamBadge: match?.homeLogoUrl ?? null,
    strAwayTeamBadge: match?.awayLogoUrl ?? null,
    intHomeScore: null,
    intAwayScore: null,
    strStatus: match?.status === 'live' ? 'LIVE' : match?.status === 'ended' ? 'FT' : '',
    strProgress: null,
    strTime: null,
    dateEvent: today,
    strVenue: match?.venue ?? 'Venue pending',
    strProvider: 'SportZX',
  }
}

function sortMatchesForFeed(matches) {
  return [...matches].sort((left, right) => {
    const leftLive = String(left?.strStatus ?? '').toUpperCase().includes('LIVE') ? 1 : 0
    const rightLive = String(right?.strStatus ?? '').toUpperCase().includes('LIVE') ? 1 : 0
    if (leftLive !== rightLive) {
      return rightLive - leftLive
    }

    const leftDate = `${String(left?.dateEvent ?? '9999-99-99')} ${String(left?.strTime ?? '99:99')}`
    const rightDate = `${String(right?.dateEvent ?? '9999-99-99')} ${String(right?.strTime ?? '99:99')}`
    return leftDate.localeCompare(rightDate)
  })
}

async function handleSportzxMatches(requestUrl, response) {
  try {
    const sportId = requestUrl.searchParams.get('sportId')?.trim() ?? ''
    const status = requestUrl.searchParams.get('status')?.trim() ?? ''

    const catalog = await fetchSportzxCatalog()
    const matches = (Array.isArray(catalog?.matches) ? catalog.matches : [])
      .filter((match) => (sportId ? String(match?.sportId ?? '') === sportId : true))
      .filter((match) => (status ? String(match?.status ?? '') === status : true))
      .map(mapSportzxMatchToFrontend)

    sendJson(response, 200, { matches })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch SportZX matches',
    })
  }
}

async function handleSportzxSports(response) {
  try {
    const catalog = await fetchSportzxCatalog()
    const counts = new Map()

    for (const match of Array.isArray(catalog?.matches) ? catalog.matches : []) {
      const sportId = String(match?.sportId ?? '').trim()
      if (!sportId) {
        continue
      }
      counts.set(sportId, (counts.get(sportId) ?? 0) + 1)
    }

    const sports = [...counts.entries()]
      .map(([sportId, count]) => {
        const display = SPORTZX_SPORT_DISPLAY[sportId] ?? {}
        const fallbackName = titleizeSport(sportId)

        return {
          id: sportId,
          name: display.name ?? fallbackName,
          short: display.short ?? fallbackName.slice(0, 3).toUpperCase(),
          flag: display.flag ?? '✦',
          count,
          order: display.order ?? 999,
        }
      })
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order
        }
        return left.name.localeCompare(right.name)
      })

    sendJson(response, 200, { sports })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch SportZX sports',
    })
  }
}

async function handleEvents(response) {
  try {
    const [catalog, upcomingResponses, recentResponses] = await Promise.all([
      fetchSportzxCatalog(),
      Promise.all(
        AGGREGATE_SPORTSDB_LEAGUES.map((leagueId) =>
          fetchSportsDbJson('eventsnextleague.php', { id: leagueId }).catch(() => ({ events: [] })),
        ),
      ),
      Promise.all(
        AGGREGATE_SPORTSDB_LEAGUES.map((leagueId) =>
          fetchSportsDbJson('eventspastleague.php', { id: leagueId }).catch(() => ({ events: [] })),
        ),
      ),
    ])

    const sportzxMatches = (Array.isArray(catalog?.matches) ? catalog.matches : []).map((match) =>
      mapSportzxMatchToFrontend(match),
    )

    const sportsdbUpcoming = upcomingResponses
      .flatMap((payload) => (Array.isArray(payload?.events) ? payload.events : []))
      .map((match) => ({
        ...match,
        streamSource: 'sportsdb',
        strProvider: 'TheSportsDB',
      }))

    const sportsdbRecent = recentResponses
      .flatMap((payload) => (Array.isArray(payload?.events) ? payload.events : []))
      .map((match) => ({
        ...match,
        streamSource: 'sportsdb',
        strProvider: 'TheSportsDB',
      }))

    sendJson(response, 200, {
      matches: sortMatchesForFeed([...sportzxMatches, ...sportsdbUpcoming]),
      recent: sortMatchesForFeed(sportsdbRecent),
    })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch aggregated events',
    })
  }
}

async function handleStreams(requestUrl, response) {
  try {
    const eventId = requestUrl.searchParams.get('idEvent')?.trim() ?? ''
    const matchId = requestUrl.searchParams.get('matchId')?.trim() ?? ''

    if (!eventId && !matchId) {
      sendJson(response, 400, { error: 'idEvent or matchId is required' })
      return
    }

    const cacheKey = `streams:${matchId || eventId}`
    const cached = getCachedEntry(cacheKey, STREAMS_CACHE_TTL_MS)
    if (cached) {
      sendJson(response, 200, cached.payload)
      return
    }

    if (matchId) {
      const catalog = await fetchSportzxCatalog().catch(() => null)
      const catalogMatch = findSportzxMatchById(catalog, matchId)
      let streamLookup

      try {
        streamLookup = await fetchSportzxStreams(matchId)
      } catch (error) {
        streamLookup = buildFallbackMatchPageLookup(matchId, catalogMatch?.resolverQuery?.pageUrl)
        if (!streamLookup) {
          throw error
        }
      }

      const resolvedLookup = await resolveStreamLookup(streamLookup, matchId)

      const payload = {
        streams: resolvedLookup.streams,
        pending: resolvedLookup.pending,
        message: resolvedLookup.message,
      }

      if (!payload.pending) {
        setCachedEntry(cacheKey, payload)
      }
      sendJson(response, 200, payload)
      return
    }

    const match = await fetchSportsDbEvent(eventId)
    if (!match?.strHomeTeam || !match?.strAwayTeam) {
      sendJson(response, 404, { error: 'Match not found' })
      return
    }

    const catalog = await fetchSportzxCatalog()
    const sportzxMatch = findSportzxMatch(catalog, match)
    if (!sportzxMatch?.id) {
      const payload = {
        streams: [],
        pending: true,
        message: 'No matching stream entry was found for this fixture yet.',
      }
      setCachedEntry(cacheKey, payload)
      sendJson(response, 200, payload)
      return
    }

    let streamLookup
    try {
      streamLookup = await fetchSportzxStreams(sportzxMatch.id)
    } catch (error) {
      streamLookup = buildFallbackMatchPageLookup(sportzxMatch.id, sportzxMatch?.resolverQuery?.pageUrl)
      if (!streamLookup) {
        throw error
      }
    }

    const resolvedLookup = await resolveStreamLookup(streamLookup, sportzxMatch.id)

    const payload = {
      streams: resolvedLookup.streams,
      pending: resolvedLookup.pending,
      message:
        resolvedLookup.message
          ? resolvedLookup.message
          : sportzxMatch.title
            ? `Matched via SportZX: ${sportzxMatch.title}`
            : '',
    }

    if (!payload.pending) {
      setCachedEntry(cacheKey, payload)
    }
    sendJson(response, 200, payload)
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch stream listings',
    })
  }
}

async function fetchClaudeStandings({ league, season, fallbackRows }) {
  const today = new Date().toISOString().slice(0, 10)
  const fallbackSummary = fallbackRows
    .slice(0, 20)
    .map(
      (row, index) =>
        `${index + 1}. ${row.strTeam} P:${row.intPlayed} W:${row.intWin} D:${row.intDraw} L:${row.intLoss} GF:${row.intGoalsFor} GA:${row.intGoalsAgainst} Pts:${row.intPoints} Form:${row.strForm ?? ''}`,
    )
    .join('\n')

  const prompt = [
    `Return the current ${season} ${league} standings as of ${today}.`,
    'Respond with JSON only. No markdown. No explanation.',
    'Return an array of objects with exactly these keys:',
    'strTeam, intPlayed, intWin, intDraw, intLoss, intGoalsFor, intGoalsAgainst, intPoints, strForm.',
    'Use strForm as the last five results using only W, D, and L.',
    'Keep the rows ordered from 1st place downward.',
    fallbackSummary ? `Reference standings data:\n${fallbackSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      temperature: 0,
      system:
        'You produce only valid JSON. Never wrap the response in markdown. Never include commentary.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
  }

  const payload = await response.json()
  const text = Array.isArray(payload?.content)
    ? payload.content
        .filter((block) => block?.type === 'text')
        .map((block) => block.text)
        .join('\n')
    : ''

  const parsed = JSON.parse(normalizeClaudeText(text))

  if (!Array.isArray(parsed)) {
    throw new Error('Claude did not return a standings array')
  }

  return parsed
}

async function handleStandings(request, response) {
  try {
    const body = await readJsonBody(request)
    const league = typeof body.league === 'string' ? body.league : ''
    const leagueId = typeof body.leagueId === 'string' ? body.leagueId : ''
    const season = typeof body.season === 'string' ? body.season : new Date().getFullYear().toString()

    if (!league) {
      sendJson(response, 400, { error: 'league is required' })
      return
    }

    const fallbackRows = await fetchSportsDbTable(leagueId, season)
    const fallbackBadgeMap = new Map(
      fallbackRows
        .filter((row) => typeof row?.strTeam === 'string')
        .map((row) => [row.strTeam.toLowerCase(), row]),
    )

    const cacheKey = `standings:${leagueId}:${league}:${season}:${ANTHROPIC_API_KEY ? 'claude' : 'sportsdb'}`
    const cached = getCachedEntry(cacheKey, STANDINGS_CACHE_TTL_MS)
    if (cached) {
      sendJson(response, 200, cached.payload)
      return
    }

    let normalizedRows = fallbackRows
      .map((row) => normalizeStandingRow(row, fallbackBadgeMap))
      .filter((row) => row.strTeam)

    if (ANTHROPIC_API_KEY) {
      const rows = await fetchClaudeStandings({ league, season, fallbackRows })
      normalizedRows = rows
        .map((row) => normalizeStandingRow(row, fallbackBadgeMap))
        .filter((row) => row.strTeam)
    }

    setCachedEntry(cacheKey, normalizedRows)
    sendJson(response, 200, normalizedRows)
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch standings',
    })
  }
}

async function serveStaticAsset(requestUrl, response) {
  const requestPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
  const resolvedPath = path.normalize(path.join(DIST_DIR, requestPath))

  if (!resolvedPath.startsWith(DIST_DIR)) {
    sendText(response, 403, 'Forbidden')
    return true
  }

  try {
    const fileInfo = await stat(resolvedPath)
    if (!fileInfo.isFile()) {
      throw new Error('Not a file')
    }

    const extension = path.extname(resolvedPath).toLowerCase()
    const content = await readFile(resolvedPath)
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    })
    response.end(content)
    return true
  } catch {
    if (requestPath.startsWith('/assets/') || requestPath === '/favicon.svg' || requestPath === '/icons.svg') {
      sendText(response, 404, 'Not found')
      return true
    }

    try {
      const indexFile = await readFile(path.join(DIST_DIR, 'index.html'))
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
      })
      response.end(indexFile)
      return true
    } catch {
      sendText(response, 404, 'Build output not found. Run npm run build first.')
      return true
    }
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/sportsdb/')) {
      await proxySportsDb(requestUrl, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/standings') {
      await handleStandings(request, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/streams') {
      await handleStreams(requestUrl, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
      await handleEvents(response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/sportzx/matches') {
      await handleSportzxMatches(requestUrl, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/sportzx/sports') {
      await handleSportzxSports(response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        anthropicConfigured: Boolean(ANTHROPIC_API_KEY),
        model: ANTHROPIC_MODEL,
      })
      return
    }

    if (request.method !== 'GET') {
      sendText(response, 405, 'Method not allowed')
      return
    }

    await serveStaticAsset(requestUrl, response)
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Server error',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`webos-live-sports backend listening on http://${HOST}:${PORT}`)
})
