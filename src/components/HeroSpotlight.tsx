import { TeamCrest } from './TeamCrest';
import type { MatchCardData, StreamOption } from '../types';

interface HeroSpotlightProps {
  match: MatchCardData;
  accent: string;
  streamCount: number;
  mode?: 'home' | 'detail';
  selectedStream?: StreamOption | null;
}

function getStatusLabel(match: MatchCardData) {
  if (match.status === 'live') {
    return match.minuteLabel || 'LIVE';
  }
  if (match.status === 'ended') {
    return 'Full Time';
  }
  return match.kickoffLabel;
}

function getDisplayScore(match: MatchCardData) {
  return String(match.scoreLine || '').trim();
}

export function HeroSpotlight({
  match,
  accent,
  streamCount,
  mode = 'home',
  selectedStream = null,
}: HeroSpotlightProps) {
  const displayScore = getDisplayScore(match);
  const helperText =
    mode === 'detail'
      ? selectedStream
        ? `${selectedStream.provider} selected • ${selectedStream.language} • ${selectedStream.quality}`
        : 'Browse the stream lane below to choose a feed.'
      : 'Browse the live lane and press enter to open the source picker.';

  return (
    <section className={`hero-spotlight hero-spotlight--${mode}`} style={{ ['--accent' as string]: accent }}>
      <div className="hero-wash" />
      <div className="hero-copy">
        <div className="hero-topline">
          <span className={`match-pill hero-status ${match.status === 'live' ? 'is-live' : match.status === 'ended' ? 'is-ended' : 'is-upcoming'}`}>
            {getStatusLabel(match)}
          </span>
          <span className="hero-chip">{match.league}</span>
          <span className="hero-chip">{match.round}</span>
          <span className="hero-chip">{match.venue || 'Venue pending'}</span>
        </div>
        <h1>{match.title}</h1>
        <p className="hero-summary">{match.summary}</p>
        <div className="hero-meta">
          <span>{helperText}</span>
          <span>{streamCount} feeds available</span>
        </div>
        <div className="hero-tags">
          {match.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="hero-scorecard">
        <div className="hero-team-block">
          <TeamCrest
            name={match.homeTeam}
            logoUrl={match.homeLogoUrl}
            size="lg"
            variant="light"
          />
          <span className="hero-team-label">Home</span>
          <strong>{match.homeTeam}</strong>
        </div>
        <div className={`hero-scoreline${displayScore ? '' : ' is-status'}`}>
          {displayScore || getStatusLabel(match)}
        </div>
        <div className="hero-team-block">
          <TeamCrest
            name={match.awayTeam}
            logoUrl={match.awayLogoUrl}
            size="lg"
            variant="light"
          />
          <span className="hero-team-label">Away</span>
          <strong>{match.awayTeam}</strong>
        </div>
      </div>
    </section>
  );
}
