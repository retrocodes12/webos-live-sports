import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type RefObject,
  type ReactNode,
} from 'react'
import './App.css'

const RAW_SPORTZX_API_BASE = String(import.meta.env.VITE_SPORTS_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
const RAW_SPORTSDB_API_BASE = String(import.meta.env.VITE_SPORTSDB_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
const USE_REMOTE_TV_API =
  Boolean(RAW_SPORTZX_API_BASE) && !/^https?:\/\/(?:localhost|127(?:\.\d+){3})(?::\d+)?$/i.test(RAW_SPORTZX_API_BASE)
const SPORTZX_API_BASE = USE_REMOTE_TV_API ? RAW_SPORTZX_API_BASE : ''
const SPORTSDB_API_BASE = USE_REMOTE_TV_API
  ? RAW_SPORTSDB_API_BASE || 'https://www.thesportsdb.com/api/v1/json/123'
  : '/api/sportsdb'
const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}kickoff-logo.svg`

type ScreenId =
  | 'home'
  | 'live'
  | 'competitions'
  | 'teams'
  | 'search'
  | 'settings'
  | 'detail'
  | 'player'

type League = {
  id: string
  name: string
  country: string
  flag: string
  short: string
}

type LiveFeed = League & {
  source: 'sportsdb' | 'sportzx' | 'mixed'
  sportsdbLeagueId?: string
  sportzxIds?: string[]
}

type SportzxSport = {
  id: string
  name: string
  short: string
  flag: string
  count: number
}

type SportzxCatalogSport = {
  id?: string
  name?: string
  accent?: string
  shortLabel?: string
}

type SportzxCatalogMatch = {
  id?: string | number
  sportId?: string
  sportName?: string
  league?: string
  round?: string
  venue?: string
  status?: string
  homeTeam?: string
  awayTeam?: string
  homeLogoUrl?: string | null
  awayLogoUrl?: string | null
  resolverQuery?: {
    pageUrl?: string
  } | null
}

type SportzxCatalog = {
  sports?: SportzxCatalogSport[]
  matches?: SportzxCatalogMatch[]
}

type NavItem = {
  id: Exclude<ScreenId, 'detail' | 'player'>
  icon: string
  label: string
  live?: boolean
}

type Match = {
  idEvent?: string
  streamLookupId?: string | null
  streamSource?: 'sportsdb' | 'sportzx' | null
  strProvider?: string | null
  intRound?: number | string | null
  strLeague?: string | null
  strSeason?: string | null
  strHomeTeam?: string | null
  strAwayTeam?: string | null
  strHomeTeamBadge?: string | null
  strAwayTeamBadge?: string | null
  intHomeScore?: number | string | null
  intAwayScore?: number | string | null
  strStatus?: string | null
  strProgress?: string | null
  strTime?: string | null
  dateEvent?: string | null
  strVenue?: string | null
}

type StandingRow = {
  idTeam?: string
  strTeam?: string | null
  strBadge?: string | null
  intPlayed?: string | null
  intWin?: string | null
  intDraw?: string | null
  intLoss?: string | null
  intGoalsFor?: string | null
  intGoalsAgainst?: string | null
  intGoalDifference?: string | null
  intPoints?: string | null
  strForm?: string | null
}

type Team = {
  idTeam?: string
  strTeam?: string | null
  strBadge?: string | null
  strLeague?: string | null
  intFormedYear?: string | null
  strStadium?: string | null
  intStadiumCapacity?: string | null
  strCountry?: string | null
  strDescriptionEN?: string | null
}

type TimelineEvent = {
  strTeam?: string | null
  strPlayer?: string | null
  strAssist?: string | null
  strType?: string | null
  strTimeElapsed?: string | null
}

type EventStat = {
  strStat?: string | null
  intHome?: string | null
  intAway?: string | null
}

type LineupPlayer = {
  strTeam?: string | null
  strPlayer?: string | null
  intNumber?: string | null
  strPosition?: string | null
}

type StreamOption = {
  id: string
  label: string
  provider: string
  quality: string
  language: string
  kind: 'hls' | 'dash' | 'mp4' | 'embed'
  url: string
  authorized: boolean
  drm?: boolean
  notes?: string
  headers?: Record<string, string>
}

type MatchStreams = {
  streams: StreamOption[]
  pending?: boolean
  message?: string
}

type PlayerLaunchPayload = {
  stream: StreamOption
  matchTitle: string
  competition: string
  venue: string
  kickoff: string
}

type UIMode = 'tv' | 'desktop'

const LEAGUES: League[] = [
  { id: '4328', name: 'Premier League', country: 'England', flag: '🏴', short: 'PL' },
  { id: '4335', name: 'La Liga', country: 'Spain', flag: '🇪🇸', short: 'LL' },
]

const BASE_LIVE_FEEDS: LiveFeed[] = [
  {
    id: '4328',
    name: 'Premier League',
    country: 'England',
    flag: '🏴',
    short: 'PL',
    source: 'sportsdb',
    sportsdbLeagueId: '4328',
  },
  {
    id: '4335',
    name: 'La Liga',
    country: 'Spain',
    flag: '🇪🇸',
    short: 'LL',
    source: 'mixed',
    sportsdbLeagueId: '4335',
    sportzxIds: ['laliga'],
  },
  {
    id: 'worldcupqualifying',
    name: 'World Cup',
    country: 'Global',
    flag: '🌍',
    short: 'WC',
    source: 'sportzx',
    sportzxIds: ['worldcupqualifying'],
  },
]

const MERGED_SPORTZX_IDS = new Set(['laliga', 'worldcupqualifying'])

const NAV_ITEMS: NavItem[] = [
  { id: 'home', icon: '⌂', label: 'Home' },
  { id: 'live', icon: '▶', label: 'Live', live: true },
  { id: 'competitions', icon: '🏆', label: 'Leagues' },
  { id: 'teams', icon: '👥', label: 'Teams' },
  { id: 'search', icon: '⌕', label: 'Search' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]

function getCurrentSeason(date = new Date()) {
  const currentYear = date.getFullYear()
  const startYear = date.getMonth() >= 6 ? currentYear : currentYear - 1
  return `${startYear}-${startYear + 1}`
}

const SEASON = getCurrentSeason()

let sportzxCatalogPromise: Promise<SportzxCatalog> | null = null

async function apiFetch<T>(path: string) {
  const response = await fetch(`${SPORTSDB_API_BASE}/${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

function normalizeName(value?: string | null) {
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

function tokenizeName(value?: string | null) {
  return normalizeName(value)
    .split(' ')
    .filter(Boolean)
}

function overlapScore(left?: string | null, right?: string | null) {
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

function normalizeLeague(value?: string | null) {
  return normalizeName(value)
}

function titleizeSport(value?: string | null) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function inferStreamKind(url?: string | null): StreamOption['kind'] {
  const lower = String(url ?? '').toLowerCase()
  if (lower.includes('.m3u8')) {
    return 'hls'
  }
  if (lower.includes('.mpd')) {
    return 'dash'
  }
  if (/\.(mp4|m4v)(\?|$)/i.test(lower)) {
    return 'mp4'
  }
  return 'embed'
}

function normalizeStreamOption(stream: Partial<StreamOption> | null | undefined, fallbackId: string): StreamOption {
  return {
    id: String(stream?.id ?? fallbackId),
    label: String(stream?.label ?? stream?.provider ?? 'Source'),
    provider: String(stream?.provider ?? 'Unknown'),
    quality: String(stream?.quality ?? 'Auto'),
    language: String(stream?.language ?? 'English'),
    kind:
      stream?.kind === 'hls' || stream?.kind === 'dash' || stream?.kind === 'mp4' || stream?.kind === 'embed'
        ? stream.kind
        : inferStreamKind(stream?.url),
    url: String(stream?.url ?? ''),
    authorized: stream?.authorized !== false,
    drm: Boolean(stream?.drm),
    notes: typeof stream?.notes === 'string' ? stream.notes : '',
    headers:
      stream?.headers && typeof stream.headers === 'object'
        ? Object.fromEntries(Object.entries(stream.headers).map(([key, value]) => [key, String(value)]))
        : {},
  }
}

function mapSportzxCatalogMatch(match: SportzxCatalogMatch): Match {
  const today = new Date().toISOString().slice(0, 10)

  return {
    idEvent: undefined,
    streamLookupId: String(match.id ?? ''),
    streamSource: 'sportzx',
    intRound: match.round ?? null,
    strLeague: match.league ?? match.sportName ?? titleizeSport(match.sportId),
    strSeason: SEASON,
    strHomeTeam: match.homeTeam ?? 'Home',
    strAwayTeam: match.awayTeam ?? 'Away',
    strHomeTeamBadge: match.homeLogoUrl ?? null,
    strAwayTeamBadge: match.awayLogoUrl ?? null,
    intHomeScore: null,
    intAwayScore: null,
    strStatus: match.status === 'live' ? 'LIVE' : match.status === 'ended' ? 'FT' : '',
    strProgress: null,
    strTime: null,
    dateEvent: today,
    strVenue: match.venue ?? 'Venue pending',
    strProvider: 'SportZX',
  }
}

function findSportzxCatalogMatch(catalog: SportzxCatalog, match: Match) {
  const targetLeague = normalizeLeague(match.strLeague)
  const candidates = Array.isArray(catalog.matches) ? catalog.matches : []

  const ranked = candidates
    .map((candidate) => {
      const homeScore = overlapScore(match.strHomeTeam, candidate.homeTeam)
      const awayScore = overlapScore(match.strAwayTeam, candidate.awayTeam)
      const reverseHomeScore = overlapScore(match.strHomeTeam, candidate.awayTeam)
      const reverseAwayScore = overlapScore(match.strAwayTeam, candidate.homeTeam)
      const bestPairScore = Math.max(homeScore + awayScore, reverseHomeScore + reverseAwayScore)
      const leagueScore = targetLeague && normalizeLeague(candidate.league) === targetLeague ? 2 : 0
      const liveScore = candidate.status === 'live' ? 1 : 0

      return {
        candidate,
        score: bestPairScore * 10 + leagueScore + liveScore,
      }
    })
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.score >= 20 ? ranked[0].candidate : null
}

async function fetchSportzxCatalog(): Promise<SportzxCatalog> {
  if (!USE_REMOTE_TV_API) {
    throw new Error('Direct SportZX catalog is only used in remote TV mode.')
  }

  if (!sportzxCatalogPromise) {
    sportzxCatalogPromise = fetch(`${SPORTZX_API_BASE}/catalog`).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as SportzxCatalog
    })
  }

  return sportzxCatalogPromise
}

async function fetchSportzxSports(): Promise<SportzxSport[]> {
  if (!USE_REMOTE_TV_API) {
    const response = await fetch('/api/sportzx/sports')
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as { sports?: SportzxSport[] }
    return Array.isArray(payload.sports) ? payload.sports : []
  }

  const catalog = await fetchSportzxCatalog()
  const matches = Array.isArray(catalog.matches) ? catalog.matches : []
  const counts = new Map<string, number>()

  for (const match of matches) {
    const sportId = String(match.sportId ?? '').trim()
    if (!sportId || sportId === 'all') {
      continue
    }
    counts.set(sportId, (counts.get(sportId) ?? 0) + 1)
  }

  return (Array.isArray(catalog.sports) ? catalog.sports : [])
    .filter((sport) => sport.id && sport.id !== 'all')
    .map((sport) => ({
      id: String(sport.id),
      name: String(sport.name ?? titleizeSport(sport.id)),
      short: String(sport.shortLabel ?? titleizeSport(sport.id).slice(0, 3).toUpperCase()),
      flag: '✦',
      count: counts.get(String(sport.id)) ?? 0,
    }))
}

async function fetchSportzxMatches(sportIds: string[]): Promise<Match[]> {
  if (!sportIds.length) {
    return []
  }

  if (!USE_REMOTE_TV_API) {
    const responses = await Promise.all(
      sportIds.map((sportId) =>
        fetch(`/api/sportzx/matches?sportId=${encodeURIComponent(sportId)}`)
          .then((response) =>
            response.ok ? (response.json() as Promise<{ matches?: Match[] }>) : Promise.resolve({ matches: [] }),
          )
          .catch(() => ({ matches: [] })),
      ),
    )

    return responses.flatMap((payload) => (Array.isArray(payload.matches) ? payload.matches : []))
  }

  const catalog = await fetchSportzxCatalog()
  const matches = (Array.isArray(catalog.matches) ? catalog.matches : [])
    .filter((match) => sportIds.includes(String(match.sportId ?? '')))
    .map((match) => mapSportzxCatalogMatch(match))

  return matches
}

async function fetchStreamLookup(match: Match): Promise<MatchStreams> {
  if (!USE_REMOTE_TV_API) {
    const lookupQuery = match.streamLookupId
      ? `matchId=${encodeURIComponent(match.streamLookupId)}`
      : `idEvent=${encodeURIComponent(match.idEvent ?? '')}`
    const response = await fetch(`/api/streams?${lookupQuery}`)
    const text = await response.text()
    const payload = text ? (JSON.parse(text) as MatchStreams | { error?: string }) : { streams: [] }

    if (!response.ok) {
      throw new Error('error' in payload && payload.error ? payload.error : `HTTP ${response.status}`)
    }

    return 'streams' in payload ? payload : { streams: [] }
  }

  let remoteMatchId = match.streamLookupId ?? ''
  if (!remoteMatchId && match.idEvent) {
    const catalog = await fetchSportzxCatalog()
    const matched = findSportzxCatalogMatch(catalog, match)
    remoteMatchId = String(matched?.id ?? '')
  }

  if (!remoteMatchId) {
    return {
      streams: [],
      pending: false,
      message: 'No matching stream entry was found for this fixture yet.',
    }
  }

  const response = await fetch(`${SPORTZX_API_BASE}/matches/${encodeURIComponent(remoteMatchId)}/streams`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = ((await response.json()) ?? {}) as { streams?: Partial<StreamOption>[] } | Partial<StreamOption>[]
  const rawStreams = Array.isArray(payload) ? payload : Array.isArray(payload.streams) ? payload.streams : []

  return {
    streams: rawStreams.map((stream, index) => normalizeStreamOption(stream, `${remoteMatchId}:${index}`)),
    pending: false,
    message: 'Authorized sources from the backend.',
  }
}

function useApi<T>(factory: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)

    factory()
      .then((result) => {
        if (!alive) {
          return
        }
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) {
          return
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

function buildImageUrl(src?: string | null, size: 'tiny' | 'small' | 'medium' | 'large' = 'tiny') {
  if (!src) {
    return ''
  }
  if (/\/(tiny|small|medium|large)$/.test(src)) {
    return src
  }
  return `${src}/${size}`
}

function parseScore(value: Match['intHomeScore'] | Match['intAwayScore']) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return String(value)
}

function isLiveMatch(match: Match) {
  const status = (match.strStatus ?? '').toUpperCase()
  return ['1H', '2H', 'HT', 'ET', 'PEN', 'LIVE'].some((token) => status.includes(token))
}

function isFinishedMatch(match: Match) {
  const status = (match.strStatus ?? '').toUpperCase()
  const hasScore = parseScore(match.intHomeScore) !== null && parseScore(match.intAwayScore) !== null
  return (
    status.includes('MATCH FINISHED') ||
    status.includes('FT') ||
    (hasScore && !isLiveMatch(match) && status !== '')
  )
}

function matchTimeValue(match: Match) {
  const cleanTime = (match.strTime ?? '').replace(/([+-]\d{2}:\d{2}|Z)$/, '').trim()
  return `${match.dateEvent ?? '9999-99-99'} ${cleanTime || '99:99'}`
}

function formatKickoff(time?: string | null, date?: string | null) {
  if (!time) {
    return 'TBA'
  }

  try {
    const suffix = time.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? 'Z'
    const clean = time.replace(/([+-]\d{2}:\d{2}|Z)$/, '').trim()
    const isoDate = date ?? new Date().toISOString().slice(0, 10)
    const parsed = new Date(`${isoDate}T${clean}${suffix}`)

    if (Number.isNaN(parsed.getTime())) {
      return time
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)
  } catch {
    return time
  }
}

function createPlayerLaunchPayload(match: Match, stream: StreamOption): PlayerLaunchPayload {
  return {
    stream,
    matchTitle: `${match.strHomeTeam ?? 'Home'} vs ${match.strAwayTeam ?? 'Away'}`,
    competition: match.strLeague ?? 'Live Stream',
    venue: match.strVenue ?? 'Venue pending',
    kickoff: match.dateEvent ?? 'Date pending',
  }
}

function formatHeaderDate(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatRelativeMatchDay(dateString?: string | null) {
  if (!dateString) {
    return ''
  }

  const target = new Date(`${dateString}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (target.toDateString() === today.toDateString()) {
    return 'Today'
  }
  if (target.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow'
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(target)
}

function formatProviderLabel(provider?: string | null): string {
  const raw = String(provider ?? '').trim()
  if (!raw) {
    return 'Unknown Source'
  }

  const candidate = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase()

  if (!candidate) {
    return 'Unknown Source'
  }

  if (/^live\d+\.totalsportek\.foo$/i.test(candidate) || candidate.includes('totalsportek')) {
    return 'TotalSportek'
  }
  if (candidate.includes('fsportshd') || candidate.includes('b4xsports')) {
    return 'B4xSports'
  }
  if (candidate.includes('hesgoal')) {
    return 'HesGoal TV'
  }
  return 'Other Sources'
}

function formatSourceHost(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'Unknown host'
  }

  const candidate = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()

  return candidate || 'Unknown host'
}

function buildStreamBadge(provider?: string | null) {
  const label = formatProviderLabel(provider).replace(/[^A-Za-z0-9]/g, '')
  return label.slice(0, 2).toUpperCase() || 'ST'
}

function progressPercent(progress?: string | null) {
  const minute = Number.parseInt(progress ?? '', 10)
  if (Number.isNaN(minute)) {
    return 0
  }
  return Math.max(0, Math.min(100, (minute / 90) * 100))
}

function positionClass(index: number, total: number) {
  if (index < 4) {
    return 'cl'
  }
  if (index < 6) {
    return 'el'
  }
  if (index >= total - 3) {
    return 'rel'
  }
  return ''
}

function eventIcon(type?: string | null) {
  const value = (type ?? '').toLowerCase()
  if (value.includes('goal')) {
    return '⚽'
  }
  if (value.includes('yellow')) {
    return '🟨'
  }
  if (value.includes('red')) {
    return '🟥'
  }
  if (value.includes('sub')) {
    return '🔄'
  }
  return '●'
}

function eventClass(type?: string | null) {
  const value = (type ?? '').toLowerCase()
  if (value.includes('goal')) {
    return 'goal'
  }
  if (value.includes('yellow')) {
    return 'yellow'
  }
  if (value.includes('red')) {
    return 'red'
  }
  if (value.includes('sub')) {
    return 'sub'
  }
  return ''
}

type RemoteDirection = 'up' | 'down' | 'left' | 'right'

function isFocusableCandidate(element: HTMLElement) {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
    return false
  }

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function getFocusableElements(scope?: ParentNode | null) {
  const root = scope ?? document
  return Array.from(root.querySelectorAll<HTMLElement>('.F')).filter(isFocusableCandidate)
}

function scoreDirectionalCandidate(currentRect: DOMRect, nextRect: DOMRect, direction: RemoteDirection) {
  const currentCenterX = currentRect.left + currentRect.width / 2
  const currentCenterY = currentRect.top + currentRect.height / 2
  const nextCenterX = nextRect.left + nextRect.width / 2
  const nextCenterY = nextRect.top + nextRect.height / 2
  const deltaX = nextCenterX - currentCenterX
  const deltaY = nextCenterY - currentCenterY

  if (direction === 'right' && deltaX <= 8) {
    return Number.POSITIVE_INFINITY
  }
  if (direction === 'left' && deltaX >= -8) {
    return Number.POSITIVE_INFINITY
  }
  if (direction === 'down' && deltaY <= 8) {
    return Number.POSITIVE_INFINITY
  }
  if (direction === 'up' && deltaY >= -8) {
    return Number.POSITIVE_INFINITY
  }

  const primaryDistance = direction === 'left' || direction === 'right' ? Math.abs(deltaX) : Math.abs(deltaY)
  const crossDistance = direction === 'left' || direction === 'right' ? Math.abs(deltaY) : Math.abs(deltaX)
  return primaryDistance * 1000 + crossDistance
}

function findNextFocusable(current: HTMLElement, candidates: HTMLElement[], direction: RemoteDirection) {
  const currentRect = current.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === current) {
      continue
    }

    const score = scoreDirectionalCandidate(currentRect, candidate.getBoundingClientRect(), direction)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best
}

function focusElement(element: HTMLElement | null) {
  if (!element) {
    return
  }

  window.requestAnimationFrame(() => {
    element.focus({ preventScroll: true })
    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
  })
}

function TeamLogo({
  src,
  alt,
  className,
  fallbackClassName,
  size = 'tiny',
}: {
  src?: string | null
  alt?: string | null
  className?: string
  fallbackClassName?: string
  size?: 'tiny' | 'small' | 'medium' | 'large'
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return <div className={fallbackClassName ?? 'mlogoFb'}>⚽</div>
  }

  return (
    <img
      src={buildImageUrl(src, size)}
      alt={alt ?? ''}
      className={className ?? 'mlogo'}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <div className="ltext">{label}</div>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="pb">
      <div className="pf" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function FormStrip({ form }: { form?: string | null }) {
  return (
    <div className="form-strip">
      {(form ?? '').split('').map((result, index) => (
        <span
          key={`${result}-${index}`}
          className={`fp ${result === 'W' ? 'fw' : result === 'D' ? 'fd2' : 'fl'}`}
        >
          {result}
        </span>
      ))}
    </div>
  )
}

function TopMeta({ children }: { children: ReactNode }) {
  return <div className="top-meta">{children}</div>
}

function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const timezoneLabel =
    new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''

  return (
    <TopMeta>
      <div className="clk">
        {new Intl.DateTimeFormat(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }).format(now)}
      </div>
      <span className="clock-zone">{timezoneLabel}</span>
    </TopMeta>
  )
}

function MatchCard({
  match,
  onClick,
}: {
  match: Match
  onClick?: (match: Match) => void
}) {
  const live = isLiveMatch(match)
  const finished = isFinishedMatch(match)
  const homeScore = parseScore(match.intHomeScore)
  const awayScore = parseScore(match.intAwayScore)

  return (
    <button
      type="button"
      className={`mc2 F${live ? ' live' : ''}`}
      onClick={() => onClick?.(match)}
    >
      <div className="mch">
        <div className="mhead-copy">
          <span className="mcomp">{match.strLeague ?? 'Football'}</span>
          {match.strProvider ? <span className="mprovider">{match.strProvider}</span> : null}
        </div>
        {live ? (
          <span className="bdg bdg-live">Live</span>
        ) : finished ? (
          <span className="bdg bdg-ft">FT</span>
        ) : (
          <span className="bdg bdg-up">{formatKickoff(match.strTime, match.dateEvent)}</span>
        )}
      </div>

      <div className="mteams">
        {[
          ['home', match.strHomeTeam, match.strHomeTeamBadge, homeScore],
          ['away', match.strAwayTeam, match.strAwayTeamBadge, awayScore],
        ].map(([side, teamName, logo, score]) => (
          <div key={side} className="mtr">
            <TeamLogo src={logo} alt={teamName} className="mlogo" fallbackClassName="mlogoFb" />
            <span className="mtn">{teamName ?? 'TBA'}</span>
            {score !== null ? <span className="msc">{score}</span> : null}
          </div>
        ))}
      </div>

      {live ? (
        <div>
          <div className="mtime live">{match.strProgress ? `${match.strProgress}'` : 'Live'}</div>
          <ProgressBar value={progressPercent(match.strProgress)} />
        </div>
      ) : (
        <div className="mtime">
          {finished ? 'Full Time' : formatKickoff(match.strTime, match.dateEvent)}
        </div>
      )}
    </button>
  )
}

function EmbedStreamFrame({ stream }: { stream: StreamOption }) {
  const [embedLoaded, setEmbedLoaded] = useState(false)
  const [embedError, setEmbedError] = useState('')

  return (
    <div className="stream-player-shell">
      <div className="stream-player-note">
        Embedded provider loaded inside the app. If playback stalls, try another source or use the fallback open link.
      </div>
      {embedError ? <div className="stream-player-error">{embedError}</div> : null}
      <div className="stream-player-stage">
        <iframe
          className="stream-player-frame"
          src={stream.url}
          title={`${stream.provider} ${stream.label}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-presentation allow-same-origin allow-scripts"
          onLoad={() => {
            setEmbedLoaded(true)
            setEmbedError('')
          }}
          onError={() => {
            setEmbedLoaded(false)
            setEmbedError('This provider could not load inside the internal player.')
          }}
        />
        {!embedLoaded && !embedError ? <div className="stream-player-loading">Loading provider…</div> : null}
      </div>
    </div>
  )
}

function StreamPlayer({ stream }: { stream: StreamOption | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream || stream.kind === 'embed') {
      return undefined
    }

    video.pause()
    video.removeAttribute('src')
    video.load()

    // Native playback is enough for the current direct stream types we expose here.
    video.src = stream.url

    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [stream])

  if (!stream) {
    return (
      <div className="stream-player-shell stream-player-placeholder">
        <strong>No source selected</strong>
        Pick a stream below to start playback.
      </div>
    )
  }

  if (stream.kind === 'embed') {
    return <EmbedStreamFrame key={stream.id} stream={stream} />
  }

  return (
    <div className="stream-player-shell">
      <div className="stream-player-note">
        Direct stream playback depends on browser codec support for this source.
      </div>
      <div className="stream-player-stage">
        <video
          key={stream.id}
          ref={videoRef}
          className="stream-player-video"
          controls
          playsInline
          autoPlay
          muted
        />
      </div>
    </div>
  )
}

function PlayerScreen({
  payload,
  onBack,
}: {
  payload: PlayerLaunchPayload | null
  onBack: () => void
}) {
  useEffect(() => {
    document.title = payload ? `${payload.matchTitle} | KICKOFF Player` : 'KICKOFF Player'
    return () => {
      document.title = 'KICKOFF'
    }
  }, [payload])

  if (!payload) {
    return (
      <div className="player-screen">
        <div className="player-screen-empty">
          <strong>Player unavailable</strong>
          This stream could not be started. Go back and launch it again from the stream list.
        </div>
      </div>
    )
  }

  return (
    <div className="player-screen">
      <button type="button" className="back-link player-back-link" onClick={onBack}>
        <span className="back-arrow">←</span>
        <span>Back To Streams</span>
      </button>

      <div className="player-topbar">
        <div>
          <div className="player-kicker">{payload.competition}</div>
          <div className="player-title">{payload.matchTitle}</div>
          <div className="player-subtitle">
            {payload.venue} • {payload.kickoff}
          </div>
        </div>

        <div className="player-actions">
          <a className="player-link" href={payload.stream.url} target="_blank" rel="noreferrer">
            Open Source
          </a>
          <button type="button" className="player-close" onClick={onBack}>
            Exit Player
          </button>
        </div>
      </div>

      <div className="player-stage-wrap">
        <StreamPlayer stream={payload.stream} />
      </div>
    </div>
  )
}

function Sidebar({
  screen,
  expanded,
  onNav,
  containerRef,
}: {
  screen: ScreenId
  expanded: boolean
  onNav: (screen: NavItem['id']) => void
  containerRef?: RefObject<HTMLElement | null>
}) {
  return (
    <aside ref={containerRef} className={`sb${expanded ? ' ex' : ''}`}>
      <div className="logo">
        <img className="logo-icon" src={BRAND_LOGO_SRC} alt="KICKOFF TV" />
        {expanded ? (
          <span>
            KICK<span>OFF</span>
          </span>
        ) : null}
      </div>

      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`ni F${screen === item.id ? ' act' : ''}`}
          onClick={() => onNav(item.id)}
        >
          <span className="nicon" aria-hidden="true">
            {item.icon}
          </span>
          {expanded ? <span className="nlbl">{item.label}</span> : null}
          {expanded && item.live ? <span className="ldot" /> : null}
        </button>
      ))}
    </aside>
  )
}

function DesktopTopbar({
  screen,
  onNav,
}: {
  screen: ScreenId
  onNav: (screen: NavItem['id']) => void
}) {
  return (
    <header className="desktop-topbar">
      <div className="desktop-brand">
        <img className="desktop-brand-mark" src={BRAND_LOGO_SRC} alt="KICKOFF TV" />
        <div>
          <div className="desktop-brand-title">KICKOFF Control</div>
          <div className="desktop-brand-subtitle">Desktop Testing Shell</div>
        </div>
      </div>

      <nav className="desktop-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`desktop-nav-btn F${screen === item.id ? ' on' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="desktop-actions">
        <a className="desktop-mode-link" href="/">
          TV Mode
        </a>
        <a className="desktop-mode-link desktop-mode-link-active" href="/desktop">
          Desktop Mode
        </a>
        <Clock />
      </div>
    </header>
  )
}

function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle: string
  right?: ReactNode
}) {
  return (
    <div className="sh">
      <div>
        <div className="st">{title}</div>
        <div className="ss">{subtitle}</div>
      </div>
      {right}
    </div>
  )
}

function HomeScreen({ onMatch }: { onMatch: (match: Match) => void }) {
  const { data, loading, error } = useApi(async () => {
    const nextResponses = await Promise.allSettled(
      LEAGUES.slice(0, 5).map((league) =>
        apiFetch<{ events: Match[] | null }>(`eventsnextleague.php?id=${league.id}`),
      ),
    )
    const recentResponse = await apiFetch<{ events: Match[] | null }>('eventspastleague.php?id=4328').catch(
      () => ({ events: [] }),
    )

    const upcoming = nextResponses
      .flatMap((response) =>
        response.status === 'fulfilled' ? response.value.events ?? [] : [],
      )
      .sort((a, b) => matchTimeValue(a).localeCompare(matchTimeValue(b)))

    return {
      featured: upcoming[0] ?? null,
      upcoming: upcoming.slice(0, 12),
      recent: (recentResponse.events ?? []).slice(0, 8),
    }
  }, [])

  return (
    <div className="scr on">
      <ScreenHeader
        title="Matchday Control"
        subtitle={formatHeaderDate()}
        right={
          <div className="header-right">
            <div className="li">
              <span className="ldot2" />
              Live tracking
            </div>
            <Clock />
          </div>
        }
      />

      <div className="sa">
        {loading ? <Spinner label="Loading fixtures..." /> : null}
        {error ? (
          <div className="errmsg">
            <strong>API Error</strong>
            {error}
          </div>
        ) : null}

        {!loading && !error && data?.featured ? (
          <button type="button" className="hero F" onClick={() => onMatch(data.featured!)}>
            <div className="hbg" />
            <div className="hpitch" />
            <div className="hgl" />
            <div className="hgl2" />
            <div className="corner ctl" />
            <div className="corner ctr" />
            <div className="corner cbl" />
            <div className="corner cbr" />

            <div className="hc">
              <div className="hteams">
                <div className="hteam">
                  <TeamLogo
                    src={data.featured.strHomeTeamBadge}
                    alt={data.featured.strHomeTeam}
                    className="hcrest"
                    fallbackClassName="hcrestFb"
                    size="medium"
                  />
                  <div className="htn">{data.featured.strHomeTeam ?? 'Home'}</div>
                </div>

                <div className="hsblock">
                  <div className="hscore">
                    {parseScore(data.featured.intHomeScore) !== null
                      ? `${parseScore(data.featured.intHomeScore)} - ${parseScore(data.featured.intAwayScore)}`
                      : 'VS'}
                  </div>
                  <div className="hmin">
                    {isLiveMatch(data.featured)
                      ? `${data.featured.strProgress ?? 'LIVE'}'`
                      : isFinishedMatch(data.featured)
                        ? 'FULL TIME'
                        : formatKickoff(data.featured.strTime, data.featured.dateEvent)}
                  </div>
                  <ProgressBar value={isLiveMatch(data.featured) ? progressPercent(data.featured.strProgress) : 50} />
                </div>

                <div className="hteam">
                  <TeamLogo
                    src={data.featured.strAwayTeamBadge}
                    alt={data.featured.strAwayTeam}
                    className="hcrest"
                    fallbackClassName="hcrestFb"
                    size="medium"
                  />
                  <div className="htn">{data.featured.strAwayTeam ?? 'Away'}</div>
                </div>
              </div>

              <div className="hinfo">
                <div className="hcomp">{data.featured.strLeague ?? 'Featured Match'}</div>
                <div className="hven">Venue: {data.featured.strVenue ?? 'TBA'}</div>

                <div className="hsmini">
                  {[
                    { value: data.featured.dateEvent ?? 'TBA', label: 'Date' },
                    {
                      value: formatKickoff(data.featured.strTime, data.featured.dateEvent),
                      label: 'Kickoff',
                    },
                    { value: data.featured.strSeason ?? SEASON, label: 'Season' },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="hsv">{stat.value}</div>
                      <div className="hsl">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="hbtn">Open Match Center</div>
              </div>
            </div>
          </button>
        ) : null}

        {!loading && data?.upcoming?.length ? (
          <section className="rail">
            <div className="rh">
              <div className="rt">Upcoming Fixtures</div>
              <span className="meta-note">{data.upcoming.length} matches queued</span>
            </div>
            <div className="g4">
              {data.upcoming.map((match, index) => (
                <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && data?.recent?.length ? (
          <section className="rail">
            <div className="rh">
              <div className="rt">Recent Results</div>
            </div>
            <div className="g4">
              {data.recent.map((match, index) => (
                <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function LiveScreen({ onMatch }: { onMatch: (match: Match) => void }) {
  const [leagueId, setLeagueId] = useState(BASE_LIVE_FEEDS[0].id)
  const [allMatches, setAllMatches] = useState<Match[]>([])
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { data: sportzxSports } = useApi(() => fetchSportzxSports().catch(() => []), [])

  const liveFeeds = useMemo<LiveFeed[]>(
    () => [
      ...BASE_LIVE_FEEDS,
      ...(sportzxSports ?? [])
        .filter((sport) => !MERGED_SPORTZX_IDS.has(sport.id))
        .map((sport) => ({
          id: sport.id,
          name: sport.name,
          country: `${sport.count} matches`,
          flag: sport.flag,
          short: sport.short,
          source: 'sportzx' as const,
          sportzxIds: [sport.id],
        })),
    ],
    [sportzxSports],
  )

  const selectedFeed = useMemo(
    () => liveFeeds.find((feed) => feed.id === leagueId) ?? liveFeeds[0] ?? null,
    [liveFeeds, leagueId],
  )

  useEffect(() => {
    let alive = true

    async function loadSportsDbLeagueMatches(sportsdbLeagueId: string) {
      const baseResponse = await apiFetch<{ events: Match[] | null }>(
        `eventsnextleague.php?id=${sportsdbLeagueId}`,
      )
      const baseMatches = baseResponse.events ?? []
      const currentRound = Number.parseInt(baseMatches[0]?.['intRound' as keyof Match] as string, 10) || 1

      const rounds = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          apiFetch<{ events: Match[] | null }>(
            `eventsround.php?id=${sportsdbLeagueId}&r=${currentRound + index}&s=${encodeURIComponent(SEASON)}`,
          ).catch(() => ({ events: [] })),
        ),
      )

      const unique = new Map<string, Match>()
      for (const match of rounds.flatMap((response) => response.events ?? [])) {
        if (match.idEvent) {
          unique.set(match.idEvent, {
            ...match,
            streamSource: 'sportsdb' as const,
            strProvider: 'TheSportsDB',
          })
        }
      }

      const merged = [...unique.values()].sort((a, b) => matchTimeValue(a).localeCompare(matchTimeValue(b)))
      const visible = merged.filter((match) => !isFinishedMatch(match))
      const recentResponse = await apiFetch<{ events: Match[] | null }>(
        `eventspastleague.php?id=${sportsdbLeagueId}`,
      )

      return {
        matches: visible.length ? visible : merged,
        recent: (recentResponse.events ?? []).map((match) => ({
          ...match,
          streamSource: 'sportsdb' as const,
          strProvider: 'TheSportsDB',
        })),
      }
    }

    async function loadLeagueMatches() {
      setLoading(true)
      setError(null)
      setAllMatches([])
      setRecentMatches([])
      setSelectedDay(null)

      try {
        if (!selectedFeed) {
          if (!alive) {
            return
          }

          setLoading(false)
          return
        }

        if (selectedFeed.source === 'sportzx') {
          const matches = await fetchSportzxMatches(selectedFeed.sportzxIds ?? [])

          if (!alive) {
            return
          }

          setAllMatches(matches)
          setRecentMatches([])
          setSelectedDay(matches[0]?.dateEvent ?? null)
          setLoading(false)
          return
        }

        const sportsdbData = await loadSportsDbLeagueMatches(selectedFeed.sportsdbLeagueId ?? '')
        const sportzxMatches =
          selectedFeed.source === 'mixed'
            ? await fetchSportzxMatches(selectedFeed.sportzxIds ?? [])
            : []
        const mergedMatches = [...sportsdbData.matches, ...sportzxMatches].sort((a, b) =>
          matchTimeValue(a).localeCompare(matchTimeValue(b)),
        )

        if (!alive) {
          return
        }

        setAllMatches(mergedMatches)
        setRecentMatches(sportsdbData.recent)
        setSelectedDay(mergedMatches[0]?.dateEvent ?? sportsdbData.recent[0]?.dateEvent ?? null)
        setLoading(false)
      } catch (err) {
        if (!alive) {
          return
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    void loadLeagueMatches()

    return () => {
      alive = false
    }
  }, [selectedFeed])

  const days = useMemo(
    () =>
      [...new Set(allMatches.map((match) => match.dateEvent).filter(Boolean) as string[])].sort(),
    [allMatches],
  )

  const matchesForSelectedDay = useMemo(
    () => allMatches.filter((match) => match.dateEvent === selectedDay),
    [allMatches, selectedDay],
  )

  return (
    <div className="scr on">
      <ScreenHeader
        title="Fixtures & Results"
        subtitle="Competition feeds from TheSportsDB and SportZX"
        right={<Clock />}
      />

      <div className="tabs">
        {liveFeeds.map((league) => (
          <button
            key={league.id}
            type="button"
            className={`tab F${leagueId === league.id ? ' on' : ''}`}
            onClick={() => setLeagueId(league.id)}
          >
            {league.flag} {league.short}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="Loading league schedule..." /> : null}
      {error ? (
        <div className="errmsg">
          <strong>Error</strong>
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="sa">
          {days.length ? (
            <div className="day-strip">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`day-pill${day === selectedDay ? ' selected' : ''}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <div className="day-pill-title">{formatRelativeMatchDay(day)}</div>
                  <div className="day-pill-count">
                    {allMatches.filter((match) => match.dateEvent === day).length} matches
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {matchesForSelectedDay.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">{formatRelativeMatchDay(selectedDay)} Fixtures</div>
                <span className="meta-note">{matchesForSelectedDay.length} matches</span>
              </div>
              <div className="g4">
                {matchesForSelectedDay.map((match, index) => (
                  <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                ))}
              </div>
            </section>
          ) : null}

          {recentMatches.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">Recent Results</div>
                <span className="meta-note">{recentMatches.length} matches</span>
              </div>
              <div className="g4">
                {recentMatches.map((match, index) => (
                  <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                ))}
              </div>
            </section>
          ) : null}

          {!days.length && !recentMatches.length ? (
            <div className="errmsg">
              <strong>No matches</strong>
              Try another competition.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function MatchDetailScreen({
  match,
  onBack,
  onPlayStream,
}: {
  match: Match
  onBack: () => void
  onPlayStream: (payload: PlayerLaunchPayload) => void
}) {
  const [tab, setTab] = useState<'streams' | 'timeline' | 'stats' | 'lineups'>('streams')
  const [streamRefreshKey, setStreamRefreshKey] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState('all')
  const sportsDbEventId = match.streamSource === 'sportzx' ? '' : match.idEvent ?? ''
  const { data: eventData } = useApi(
    () =>
      sportsDbEventId
        ? apiFetch<{ events: Match[] | null }>(`lookupevent.php?id=${sportsDbEventId}`).then(
            (response) => response.events?.[0] ?? match,
          )
        : Promise.resolve(match),
    [sportsDbEventId, match],
  )
  const { data: timeline } = useApi(
    () =>
      sportsDbEventId
        ? apiFetch<{ timeline: TimelineEvent[] | null }>(`lookupeventtimeline.php?id=${sportsDbEventId}`).then(
            (response) => response.timeline ?? [],
          )
        : Promise.resolve([]),
    [sportsDbEventId],
  )
  const { data: stats } = useApi(
    () =>
      sportsDbEventId
        ? apiFetch<{ eventstats: EventStat[] | null }>(`lookupeventstats.php?id=${sportsDbEventId}`).then(
            (response) => response.eventstats ?? [],
          )
        : Promise.resolve([]),
    [sportsDbEventId],
  )
  const { data: lineup } = useApi(
    () =>
      sportsDbEventId
        ? apiFetch<{ lineup: LineupPlayer[] | null }>(`lookupeventlineup.php?id=${sportsDbEventId}`).then(
            (response) => response.lineup ?? [],
          )
        : Promise.resolve([]),
    [sportsDbEventId],
  )
  const {
    data: streamData,
    loading: streamsLoading,
    error: streamsError,
  } = useApi(() => fetchStreamLookup(match), [match.idEvent, match.streamLookupId, streamRefreshKey])

  const selectedMatch = eventData ?? match
  const providerOptions = useMemo(() => {
    const streamEntries = Array.isArray(streamData?.streams) ? streamData.streams : []
    return [...new Set(streamEntries.map((stream) => formatProviderLabel(stream.provider)))].sort()
  }, [streamData])
  const activeProvider = providerOptions.includes(selectedProvider) ? selectedProvider : 'all'
  const visibleStreams = useMemo(() => {
    const streamEntries = Array.isArray(streamData?.streams) ? streamData.streams : []
    if (activeProvider === 'all') {
      return streamEntries
    }

    return streamEntries.filter((stream) => formatProviderLabel(stream.provider) === activeProvider)
  }, [activeProvider, streamData])

  useEffect(() => {
    if (!streamData?.pending) {
      return undefined
    }

    const timer = window.setTimeout(() => setStreamRefreshKey((current) => current + 1), 2500)
    return () => window.clearTimeout(timer)
  }, [streamData?.pending, streamData?.streams?.length])

  function launchStreamPlayer(stream: StreamOption) {
    onPlayStream(createPlayerLaunchPayload(selectedMatch, stream))
  }

  return (
    <div className="scr on">
      <button type="button" className="back-link" onClick={onBack}>
        <span className="back-arrow">←</span>
        <span>Back</span>
      </button>

      <div className="dheader">
        <div className="detail-meta">
          <span className="detail-league">{selectedMatch.strLeague ?? 'Match Center'}</span>
          <span className={`bdg ${isFinishedMatch(selectedMatch) ? 'bdg-ft' : 'bdg-up'}`}>
            {isFinishedMatch(selectedMatch)
              ? 'Full Time'
              : formatKickoff(selectedMatch.strTime, selectedMatch.dateEvent)}
          </span>
        </div>

        <div className="dscoreline">
          <div className="dteam">
            <TeamLogo
              src={selectedMatch.strHomeTeamBadge}
              alt={selectedMatch.strHomeTeam}
              className="dcrest"
              fallbackClassName="dcrestFb"
              size="medium"
            />
            <div className="dtn">{selectedMatch.strHomeTeam ?? 'Home'}</div>
          </div>

          <div className="dscore">
            {parseScore(selectedMatch.intHomeScore) !== null
              ? `${parseScore(selectedMatch.intHomeScore)} - ${parseScore(selectedMatch.intAwayScore)}`
              : 'VS'}
          </div>

          <div className="dteam">
            <TeamLogo
              src={selectedMatch.strAwayTeamBadge}
              alt={selectedMatch.strAwayTeam}
              className="dcrest"
              fallbackClassName="dcrestFb"
              size="medium"
            />
            <div className="dtn">{selectedMatch.strAwayTeam ?? 'Away'}</div>
          </div>
        </div>

        <div className="detail-submeta">
          Venue: {selectedMatch.strVenue ?? 'TBA'} • {selectedMatch.dateEvent ?? 'Date pending'}
        </div>
      </div>

      <div className="tabs">
        {(['streams', 'timeline', 'stats', 'lineups'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`tab F${tab === value ? ' on' : ''}`}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="sa">
        {tab === 'streams' ? (
          streamsLoading ? (
            <Spinner label="Loading stream sources" />
          ) : streamData?.streams?.length || streamData?.message ? (
            <div className="stream-panel">
              <div className="stream-note">{streamData?.message || 'Authorized sources from the backend.'}</div>

              {streamData.streams?.length ? (
                <>
                  {providerOptions.length > 1 ? (
                    <div className="stream-provider-strip">
                      <button
                        type="button"
                        className={`stream-provider-chip F${activeProvider === 'all' ? ' on' : ''}`}
                        onClick={() => setSelectedProvider('all')}
                      >
                        All Sources
                      </button>
                      {providerOptions.map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          className={`stream-provider-chip F${activeProvider === provider ? ' on' : ''}`}
                          onClick={() => setSelectedProvider(provider)}
                        >
                          {provider}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="stream-picker-copy">
                    {streamData.pending
                      ? 'Sources are resolving in the background. Ready providers will appear here automatically.'
                      : 'Select a source below to launch it in the player screen.'}
                  </div>
                  <div className="stream-grid">
                    {visibleStreams.map((stream) => {
                      const waitingOnlyFallback =
                        Boolean(streamData.pending) &&
                        streamData.streams.length === 1 &&
                        stream.label === 'Match Page'

                      return (
                      <button
                        key={stream.id}
                        type="button"
                        className={`stream-card F${waitingOnlyFallback ? ' stream-card-disabled' : ''}`}
                        onClick={() => {
                          if (!waitingOnlyFallback) {
                            launchStreamPlayer(stream)
                          }
                        }}
                        disabled={waitingOnlyFallback}
                      >
                        <div className="stream-head">
                          <div className={`stream-logo-fallback stream-logo-${stream.kind}`}>
                            {buildStreamBadge(stream.provider)}
                          </div>
                          <div className="stream-copy">
                            <div className="stream-title">{formatProviderLabel(stream.provider)}</div>
                            <div className="stream-meta">{formatSourceHost(stream.url || stream.provider)}</div>
                          </div>
                          <div className="stream-kind-chip">
                            {stream.kind.toUpperCase()}
                          </div>
                        </div>

                        <div className="stream-pills">
                          <span className="stream-pill">{stream.quality}</span>
                          <span className="stream-pill">{stream.language}</span>
                          {waitingOnlyFallback ? (
                            <span className="stream-pill stream-pill-pending">Resolving</span>
                          ) : stream.authorized ? (
                            <span className="stream-pill stream-pill-live">Ready</span>
                          ) : null}
                        </div>

                        <div className="stream-foot">
                          <span className="stream-source">{formatSourceHost(stream.url || stream.provider)}</span>
                          <a
                            className="stream-time stream-open"
                            href={stream.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open Link
                          </a>
                        </div>

                        {stream.notes ? <div className="stream-extra">{stream.notes}</div> : null}
                      </button>
                    )})}
                  </div>
                  {!visibleStreams.length ? (
                    <div className="errmsg">
                      <strong>No sources in this provider</strong>
                      Pick a different provider filter to view the other streams.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="errmsg">
              <strong>{streamsError ? 'Streams unavailable' : 'No streams found'}</strong>
              {streamsError
                ? streamsError
                : 'No backend stream sources were found for this fixture yet.'}
            </div>
          )
        ) : null}

        {tab === 'timeline' ? (
          timeline?.length ? (
            <div className="tline">
              <div className="tlineL" />
              {timeline.map((entry, index) => {
                const homeSide = entry.strTeam === selectedMatch.strHomeTeam
                return (
                  <div key={`${entry.strPlayer}-${index}`} className={`tevt ${homeSide ? 'home' : 'away'}`}>
                    <div className="tevtInner">
                      <div className="tevtInfo">
                        <div className="tevtPlayer">{entry.strPlayer ?? entry.strAssist ?? 'Unknown'}</div>
                        <div className="tevtDesc">{entry.strType ?? 'Event'}</div>
                      </div>
                      <div className={`tevtIcon ${eventClass(entry.strType)}`}>{eventIcon(entry.strType)}</div>
                      <div className="tevtTime">
                        {entry.strTimeElapsed ? `${entry.strTimeElapsed}'` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="errmsg">
              <strong>No timeline</strong>
              Match events are not available yet.
            </div>
          )
        ) : null}

        {tab === 'stats' ? (
          stats?.length ? (
            <div className="stats-panel">
              <div className="stats-head">
                <span>{selectedMatch.strHomeTeam ?? 'Home'}</span>
                <span>{selectedMatch.strAwayTeam ?? 'Away'}</span>
              </div>

              {stats.map((stat, index) => {
                const home = Number.parseFloat(stat.intHome ?? '0') || 0
                const away = Number.parseFloat(stat.intAway ?? '0') || 0
                const total = home + away || 1

                return (
                  <div key={`${stat.strStat}-${index}`} className="sbrow">
                    <div className="sbv">{stat.intHome ?? '0'}</div>
                    <div className="stat-center">
                      <div className="sblbl">{stat.strStat ?? 'Metric'}</div>
                      <div className="stat-bars">
                        <div className="sbtrack" style={{ flex: home / total }}>
                          <div className="sbfill sbfill-home" />
                        </div>
                        <div className="sbtrack" style={{ flex: away / total }}>
                          <div className="sbfill sbfill-away" />
                        </div>
                      </div>
                    </div>
                    <div className="sbv align-right">{stat.intAway ?? '0'}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="errmsg">
              <strong>No stats</strong>
              Match statistics are not available for this fixture.
            </div>
          )
        ) : null}

        {tab === 'lineups' ? (
          <div className="g2">
            {[
              [selectedMatch.strHomeTeam, selectedMatch.strHomeTeamBadge],
              [selectedMatch.strAwayTeam, selectedMatch.strAwayTeamBadge],
            ].map(([teamName, badge]) => {
              const players = (lineup ?? []).filter((player) => player.strTeam === teamName)
              return (
                <div key={teamName ?? 'team'}>
                  <div className="lineup-head">
                    <TeamLogo src={badge} alt={teamName} className="mlogo" fallbackClassName="mlogoFb" />
                    <div className="lineup-title">{teamName ?? 'Team'}</div>
                  </div>

                  {players.length ? (
                    players.map((player, index) => (
                      <div key={`${player.strPlayer}-${index}`} className="prow">
                        <span className="pnum">{player.intNumber ?? index + 1}</span>
                        <span className="pname">{player.strPlayer ?? 'Unknown Player'}</span>
                        <span className={`ppos ${player.strPosition ?? ''}`}>
                          {player.strPosition ?? 'N/A'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="errmsg">Lineup not available.</div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CompetitionsScreen({ onMatch }: { onMatch: (match: Match) => void }) {
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0])

  const { data: table, loading, error } = useApi(
    async () => {
      if (USE_REMOTE_TV_API) {
        const payload = await apiFetch<{ table?: StandingRow[] | null }>(
          `lookuptable.php?l=${encodeURIComponent(selectedLeague.id)}&s=${encodeURIComponent(SEASON)}`,
        )
        return payload.table ?? []
      }

      const response = await fetch('/api/standings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leagueId: selectedLeague.id,
          league: selectedLeague.name,
          season: SEASON,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `HTTP ${response.status}`)
      }

      return (await response.json()) as StandingRow[]
    },
    [selectedLeague.id, selectedLeague.name],
  )

  const { data: upcoming } = useApi(
    () =>
      apiFetch<{ events: Match[] | null }>(`eventsnextleague.php?id=${selectedLeague.id}`).then(
        (response) => (response.events ?? []).slice(0, 6),
      ),
    [selectedLeague.id],
  )

  const { data: recent } = useApi(
    () =>
      apiFetch<{ events: Match[] | null }>(`eventspastleague.php?id=${selectedLeague.id}`).then(
        (response) => (response.events ?? []).slice(0, 6),
      ),
    [selectedLeague.id],
  )

  return (
    <div className="scr on">
      <ScreenHeader title="Competitions" subtitle={`Standings and fixtures for ${SEASON}`} />

      <div className="comp-layout">
        <div className="sa">
          {LEAGUES.map((league) => (
            <button
              key={league.id}
              type="button"
              className={`compH F${selectedLeague.id === league.id ? ' on' : ''}`}
              onClick={() => setSelectedLeague(league)}
            >
              <span className="chFlag">{league.flag}</span>
              <span>
                <span className="chName">{league.name}</span>
                <span className="chSub">{league.country}</span>
              </span>
              {selectedLeague.id === league.id ? <span className="comp-arrow">→</span> : null}
            </button>
          ))}
        </div>

        <div className="sa">
          <div className="competition-title">
            {selectedLeague.flag} {selectedLeague.name}
          </div>

          {loading ? <Spinner label="Loading standings..." /> : null}
          {error ? (
            <div className="errmsg">
              <strong>Error</strong>
              {error}
            </div>
          ) : null}

          {!loading && !error && table?.length ? (
            <table className="stbl">
              <thead>
                <tr>
                  {['#', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'Form'].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((row, index) => (
                  <tr key={row.idTeam ?? `${row.strTeam}-${index}`} className="F">
                    <td>
                      <span className={`spos ${positionClass(index, table.length)}`}>{index + 1}</span>
                    </td>
                    <td>
                      <div className="stc">
                        <TeamLogo
                          src={row.strBadge}
                          alt={row.strTeam}
                          className="slogo"
                          fallbackClassName="slogoFb"
                        />
                        <span className="stn">{row.strTeam ?? 'Unknown Club'}</span>
                      </div>
                    </td>
                    {[
                      row.intPlayed,
                      row.intWin,
                      row.intDraw,
                      row.intLoss,
                      row.intGoalsFor,
                      row.intGoalsAgainst,
                      row.intGoalDifference ??
                        String(
                          (Number.parseInt(row.intGoalsFor ?? '0', 10) || 0) -
                            (Number.parseInt(row.intGoalsAgainst ?? '0', 10) || 0),
                        ),
                    ].map((value, columnIndex) => (
                      <td key={`${row.idTeam}-${columnIndex}`} className="align-center">
                        {value ?? '—'}
                      </td>
                    ))}
                    <td className="align-center">
                      <span className="spts">{row.intPoints ?? '0'}</span>
                    </td>
                    <td>
                      <FormStrip form={row.strForm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {!loading && !error && !table?.length ? (
            <div className="errmsg">
              <strong>No standings</strong>
              Standings are not available for this competition.
            </div>
          ) : null}

          {upcoming?.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">Upcoming Fixtures</div>
              </div>
              <div className="g3">
                {upcoming.map((match, index) => (
                  <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                ))}
              </div>
            </section>
          ) : null}

          {recent?.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">Recent Results</div>
              </div>
              <div className="g3">
                {recent.map((match, index) => (
                  <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TeamsScreen({ onMatch }: { onMatch: (match: Match) => void }) {
  const [leagueId, setLeagueId] = useState(LEAGUES[0].id)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  const { data: teams, loading, error } = useApi(
    () =>
      apiFetch<{ teams: Team[] | null }>(`lookup_all_teams.php?id=${leagueId}`).then((response) =>
        (response.teams ?? []).sort((a, b) => (a.strTeam ?? '').localeCompare(b.strTeam ?? '')),
      ),
    [leagueId],
  )

  const { data: nextFixtures } = useApi(
    () =>
      selectedTeam?.idTeam
        ? apiFetch<{ events: Match[] | null }>(`eventsnext.php?id=${selectedTeam.idTeam}`).then(
            (response) => (response.events ?? []).slice(0, 3),
          )
        : Promise.resolve([]),
    [selectedTeam?.idTeam],
  )

  const { data: recentFixtures } = useApi(
    () =>
      selectedTeam?.idTeam
        ? apiFetch<{ results: Match[] | null }>(`eventslast.php?id=${selectedTeam.idTeam}`).then(
            (response) => (response.results ?? []).slice(0, 3),
          )
        : Promise.resolve([]),
    [selectedTeam?.idTeam],
  )

  return (
    <div className="scr on">
      <ScreenHeader title="Teams" subtitle={`${teams?.length ?? '...'} clubs tracked`} />

      <div className="tabs">
        {LEAGUES.slice(0, 5).map((league) => (
          <button
            key={league.id}
            type="button"
            className={`tab F${leagueId === league.id ? ' on' : ''}`}
            onClick={() => {
              setLeagueId(league.id)
              setSelectedTeam(null)
            }}
          >
            {league.flag} {league.short}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="Loading clubs..." /> : null}
      {error ? (
        <div className="errmsg">
          <strong>Error</strong>
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        selectedTeam ? (
          <div>
            <button type="button" className="back-link" onClick={() => setSelectedTeam(null)}>
              <span className="back-arrow">←</span>
              <span>All Teams</span>
            </button>

            <div className="team-detail">
              {selectedTeam.strBadge ? (
                <img
                  src={buildImageUrl(selectedTeam.strBadge, 'medium')}
                  alt={selectedTeam.strTeam ?? ''}
                  className="team-detail-badge"
                />
              ) : (
                <div className="team-detail-badge fallback">⚽</div>
              )}

              <div className="team-detail-copy">
                <div className="team-detail-name">{selectedTeam.strTeam ?? 'Club'}</div>
                <div className="team-detail-league">{selectedTeam.strLeague ?? 'League'}</div>

                <div className="team-metrics">
                  {[
                    { value: selectedTeam.intFormedYear ?? '—', label: 'Founded' },
                    { value: selectedTeam.strStadium ?? '—', label: 'Stadium' },
                    {
                      value: selectedTeam.intStadiumCapacity
                        ? Number(selectedTeam.intStadiumCapacity).toLocaleString()
                        : '—',
                      label: 'Capacity',
                    },
                    { value: selectedTeam.strCountry ?? '—', label: 'Country' },
                  ].map((metric) => (
                    <div key={metric.label} className="metric">
                      <div className="metric-value">{metric.value}</div>
                      <div className="ml">{metric.label}</div>
                    </div>
                  ))}
                </div>

                {selectedTeam.strDescriptionEN ? (
                  <div className="team-detail-description">
                    {selectedTeam.strDescriptionEN.slice(0, 320)}...
                  </div>
                ) : null}
              </div>
            </div>

            <div className="g2">
              <section className="rail">
                <div className="rh">
                  <div className="rt">Next Fixtures</div>
                </div>
                <div className="stack-cards">
                  {(nextFixtures ?? []).map((match, index) => (
                    <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                  ))}
                </div>
              </section>

              <section className="rail">
                <div className="rh">
                  <div className="rt">Recent Results</div>
                </div>
                <div className="stack-cards">
                  {(recentFixtures ?? []).map((match, index) => (
                    <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="sa">
            <div className="g5">
              {(teams ?? []).map((team, index) => (
                <button
                  key={team.idTeam ?? `${team.strTeam}-${index}`}
                  type="button"
                  className="tc F"
                  onClick={() => setSelectedTeam(team)}
                >
                  <TeamLogo
                    src={team.strBadge}
                    alt={team.strTeam}
                    className="tclogo"
                    fallbackClassName="tclogoFb"
                    size="small"
                  />
                  <div className="tcname">{team.strTeam ?? 'Club'}</div>
                  <div className="tcleague">{team.strLeague ?? ''}</div>
                  {team.intFormedYear ? <div className="est-label">Est. {team.intFormedYear}</div> : null}
                </button>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  )
}

function SearchScreen({ onMatch }: { onMatch: (match: Match) => void }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data: teamResults, loading: loadingTeams } = useApi(
    () =>
      submitted
        ? apiFetch<{ teams: Team[] | null }>(`searchteams.php?t=${encodeURIComponent(submitted)}`).then(
            (response) => response.teams ?? [],
          )
        : Promise.resolve([]),
    [submitted],
  )

  const { data: eventResults, loading: loadingEvents } = useApi(
    () =>
      submitted
        ? apiFetch<{ event: Match[] | null }>(`searchevents.php?e=${encodeURIComponent(submitted)}`).then(
            (response) => (response.event ?? []).slice(0, 6),
          )
        : Promise.resolve([]),
    [submitted],
  )

  const loading = loadingTeams || loadingEvents

  function submitSearch(value = query) {
    const trimmed = value.trim()
    if (trimmed) {
      setSubmitted(trimmed)
      setQuery(trimmed)
    }
  }

  return (
    <div className="scr on">
      <ScreenHeader title="Search" subtitle="Teams, matches and live events" />

      <div className="search-wrap">
        <input
          className="sinput F"
          type="text"
          placeholder="Search teams, events, matches..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitSearch()
            }
          }}
        />
        <button type="button" className="search-button" onClick={() => submitSearch()}>
          ⌕
        </button>
      </div>

      {!submitted ? (
        <div>
          <div className="quick-title">Quick Search</div>
          <div className="quick-list">
            {['Arsenal', 'Manchester City', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'PSG', 'Liverpool', 'Chelsea'].map((tag) => (
              <button key={tag} type="button" className="tab F" onClick={() => submitSearch(tag)}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {submitted && loading ? <Spinner label={`Searching "${submitted}"...`} /> : null}

      {submitted && !loading ? (
        <div className="sa">
          {!teamResults?.length && !eventResults?.length ? (
            <div className="errmsg">
              <strong>No results</strong>
              Nothing matched "{submitted}".
            </div>
          ) : null}

          {teamResults?.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">Teams</div>
                <span className="meta-note">{teamResults.length} found</span>
              </div>
              <div className="g5">
                {teamResults.slice(0, 10).map((team, index) => (
                  <div key={team.idTeam ?? `${team.strTeam}-${index}`} className="tc">
                    <TeamLogo
                      src={team.strBadge}
                      alt={team.strTeam}
                      className="tclogo"
                      fallbackClassName="tclogoFb"
                      size="small"
                    />
                    <div className="tcname">{team.strTeam ?? 'Club'}</div>
                    <div className="tcleague">{team.strLeague ?? ''}</div>
                    {team.intFormedYear ? <div className="est-label">Est. {team.intFormedYear}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {eventResults?.length ? (
            <section className="rail">
              <div className="rh">
                <div className="rt">Matches</div>
              </div>
              <div className="g3">
                {eventResults.map((match, index) => (
                  <MatchCard key={match.idEvent ?? `${match.strHomeTeam}-${index}`} match={match} onClick={onMatch} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SettingsScreen() {
  const [config, setConfig] = useState({
    notifications: true,
    liveAlerts: true,
    autoRefresh: true,
    darkMode: true,
    audioCommentary: false,
  })

  function toggle(key: keyof typeof config) {
    setConfig((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className="scr on">
      <ScreenHeader title="Settings" subtitle="Customize the matchday experience" />

      <div className="g2 settings-grid">
        <div>
          <div className="settings-label">Notifications</div>
          {[
            { key: 'notifications', label: 'Push Notifications' },
            { key: 'liveAlerts', label: 'Live Match Alerts' },
            { key: 'audioCommentary', label: 'Audio Commentary' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="sitem F"
              onClick={() => toggle(item.key as keyof typeof config)}
            >
              <span className="silbl">{item.label}</span>
              <span className={`tog ${config[item.key as keyof typeof config] ? 'on' : ''}`} />
            </button>
          ))}

          <div className="settings-label">Display</div>
          {[
            { key: 'darkMode', label: 'Dark Mode' },
            { key: 'autoRefresh', label: 'Auto Refresh Scores' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="sitem F"
              onClick={() => toggle(item.key as keyof typeof config)}
            >
              <span className="silbl">{item.label}</span>
              <span className={`tog ${config[item.key as keyof typeof config] ? 'on' : ''}`} />
            </button>
          ))}
        </div>

        <div>
          <div className="settings-label">Data Source</div>
          {[
            ['API Provider', 'TheSportsDB'],
            ['Season', SEASON],
            ['Coverage', `${LEAGUES.length} competitions`],
            ['Navigation', 'TV-first layout'],
            ['Frontend', 'React + Vite'],
          ].map(([label, value]) => (
            <div key={label} className="sitem">
              <span className="silbl">{label}</span>
              <span className="sival">{value}</span>
            </div>
          ))}

          <button type="button" className="sitem F reset-item">
            <span className="silbl reset-text">Clear Cache & Restart</span>
            <span className="reset-icon">↺</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const uiMode: UIMode = window.location.pathname.startsWith('/desktop') ? 'desktop' : 'tv'
  const [screen, setScreen] = useState<ScreenId>('home')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [playerPayload, setPlayerPayload] = useState<PlayerLaunchPayload | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    document.body.classList.toggle('desktop-mode', uiMode === 'desktop')

    return () => {
      document.body.classList.remove('desktop-mode')
    }
  }, [uiMode])

  useEffect(() => {
    if (!toast) {
      return undefined
    }
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  function navigate(nextScreen: NavItem['id']) {
    setScreen(nextScreen)
    setSelectedMatch(null)
    setPlayerPayload(null)
    setSidebarExpanded(false)
    const navItem = NAV_ITEMS.find((item) => item.id === nextScreen)
    setToast(navItem?.label ?? nextScreen)
  }

  function openMatch(match: Match) {
    setSelectedMatch(match)
    setScreen('detail')
  }

  function openPlayer(payload: PlayerLaunchPayload) {
    setPlayerPayload(payload)
    setScreen('player')
  }

  function focusSidebarTarget() {
    const activeNav = sidebarRef.current?.querySelector<HTMLElement>('.ni.act')
    focusElement(activeNav ?? getFocusableElements(sidebarRef.current)[0] ?? null)
  }

  function focusMainTarget() {
    focusElement(getFocusableElements(mainRef.current)[0] ?? null)
  }

  function moveFocus(direction: RemoteDirection) {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const inSidebar = Boolean(activeElement && sidebarRef.current?.contains(activeElement))
    const scope = inSidebar ? sidebarRef.current : mainRef.current
    const focusable = getFocusableElements(scope)

    if (!focusable.length) {
      return false
    }

    const current = activeElement && focusable.includes(activeElement) ? activeElement : focusable[0]
    if (!current) {
      focusElement(focusable[0])
      return true
    }

    const next = findNextFocusable(current, focusable, direction)
    if (next) {
      focusElement(next)
      return true
    }

    return false
  }

  useEffect(() => {
    if (uiMode !== 'tv') {
      return undefined
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT') {
        return
      }

      const key = event.key
      const keyCode = event.keyCode || event.which

      if (key === 'Enter' || key === 'OK' || keyCode === 13) {
        const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (activeElement && activeElement !== document.body) {
          event.preventDefault()
          activeElement.click()
        }
        return
      }

      if (key === 'Escape' || key === 'Backspace' || keyCode === 461) {
        event.preventDefault()
        if (screen === 'player') {
          setScreen('detail')
        } else if (screen === 'detail') {
          setScreen('live')
          setSelectedMatch(null)
        } else if (sidebarExpanded) {
          setSidebarExpanded(false)
        }
        return
      }

      if (key === 'ArrowLeft' || keyCode === 37) {
        event.preventDefault()
        if (!sidebarExpanded && screen !== 'player') {
          setSidebarExpanded(true)
          window.requestAnimationFrame(() => focusSidebarTarget())
          return
        }

        if (!moveFocus('left') && screen !== 'player') {
          setSidebarExpanded(true)
          window.requestAnimationFrame(() => focusSidebarTarget())
        }
        return
      }

      if (key === 'ArrowRight' || keyCode === 39) {
        event.preventDefault()
        const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const inSidebar = Boolean(activeElement && sidebarRef.current?.contains(activeElement))

        if (sidebarExpanded && inSidebar && screen !== 'player') {
          setSidebarExpanded(false)
          window.requestAnimationFrame(() => focusMainTarget())
          return
        }

        moveFocus('right')
        return
      }

      if (key === 'ArrowUp' || keyCode === 38) {
        event.preventDefault()
        moveFocus('up')
        return
      }

      if (key === 'ArrowDown' || keyCode === 40) {
        event.preventDefault()
        moveFocus('down')
        return
      }

      if (key >= '1' && key <= String(NAV_ITEMS.length)) {
        const navItem = NAV_ITEMS[Number(key) - 1]
        if (navItem) {
          event.preventDefault()
          navigate(navItem.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen, sidebarExpanded, uiMode])

  useEffect(() => {
    if (uiMode !== 'tv') {
      return
    }

    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (activeElement && activeElement !== document.body) {
        return
      }

      if (screen === 'player') {
        focusMainTarget()
        return
      }

      if (sidebarExpanded) {
        focusSidebarTarget()
        return
      }

      focusMainTarget()
    })
  }, [screen, sidebarExpanded, uiMode])

  const appContent =
    screen === 'player' ? (
      <PlayerScreen payload={playerPayload} onBack={() => setScreen('detail')} />
    ) : screen === 'detail' && selectedMatch ? (
      <MatchDetailScreen match={selectedMatch} onBack={() => navigate('live')} onPlayStream={openPlayer} />
    ) : screen === 'home' ? (
      <HomeScreen onMatch={openMatch} />
    ) : screen === 'live' ? (
      <LiveScreen onMatch={openMatch} />
    ) : screen === 'competitions' ? (
      <CompetitionsScreen onMatch={openMatch} />
    ) : screen === 'teams' ? (
      <TeamsScreen onMatch={openMatch} />
    ) : screen === 'search' ? (
      <SearchScreen onMatch={openMatch} />
    ) : (
      <SettingsScreen />
    )

  if (uiMode === 'desktop') {
    return (
      <div className={`desktop-shell${screen === 'player' ? ' desktop-player-mode' : ''}`}>
        {screen === 'player' ? null : <DesktopTopbar screen={screen} onNav={navigate} />}
        <main className="desktop-main">{appContent}</main>
        {toast ? <div className="toast">▸ {toast}</div> : null}
      </div>
    )
  }

  return (
    <div className={`app-shell${sidebarExpanded ? ' expanded' : ''}${screen === 'player' ? ' player-mode' : ''}`}>
      {screen === 'player' ? null : (
        <Sidebar screen={screen} expanded={sidebarExpanded} onNav={navigate} containerRef={sidebarRef} />
      )}

      <main
        ref={mainRef}
        className={`mc-wrap${sidebarExpanded ? ' ex' : ''}`}
        onClick={() => sidebarExpanded && setSidebarExpanded(false)}
      >
        {appContent}
      </main>

      {screen === 'player' ? null : (
        <div className="kbbar">
          {[
            ['← →', 'Sidebar'],
            ['1-6', 'Quick Nav'],
            ['Esc', 'Back'],
          ].map(([keyLabel, text]) => (
            <div key={keyLabel} className="kbh">
              <span className="kbk">{keyLabel}</span>
              <span>{text}</span>
            </div>
          ))}

          <div className="kbbar-brand">
            <span>KICKOFF TV</span>
            <span className="kbbar-dot">●</span>
            <span>TheSportsDB</span>
          </div>
        </div>
      )}

      {toast ? <div className="toast">▸ {toast}</div> : null}
    </div>
  )
}

export default App
