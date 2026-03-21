export type MatchStatus = 'live' | 'upcoming' | 'ended';
export type StreamKind = 'hls' | 'dash' | 'mp4' | 'embed';

export interface SportCategory {
  id: string;
  name: string;
  accent: string;
  shortLabel: string;
}

export interface StreamOption {
  id: string;
  label: string;
  provider: string;
  quality: string;
  language: string;
  kind: StreamKind;
  url: string;
  authorized: boolean;
  drm?: boolean;
  notes?: string;
  headers?: Record<string, string>;
}

export interface MatchCardData {
  id: string;
  sportId: string;
  league: string;
  round: string;
  title: string;
  summary: string;
  venue: string;
  status: MatchStatus;
  kickoffLabel: string;
  minuteLabel?: string;
  scoreLine: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  tags: string[];
  streams: StreamOption[];
  streamCountHint?: number;
}

export interface SportsCatalog {
  sports: SportCategory[];
  matches: MatchCardData[];
}
