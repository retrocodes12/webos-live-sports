import { memo, type Ref, useEffect, useRef } from 'react';

import { TeamCrest } from './TeamCrest';
import type { MatchCardData } from '../types';
import { getPreferredScrollBehavior } from '../utils/platform';

interface MatchListProps {
  matches: MatchCardData[];
  selectedIndex: number;
  focused: boolean;
  accentBySport: Record<string, string>;
}

interface MatchPosterProps {
  match: MatchCardData;
  selected: boolean;
  focused: boolean;
  cardAccent: string;
  cardRef?: Ref<HTMLButtonElement>;
}

function getStatusClass(status: MatchCardData['status']) {
  if (status === 'live') return 'is-live';
  if (status === 'upcoming') return 'is-upcoming';
  return 'is-ended';
}

function getCardScoreText(match: MatchCardData) {
  const score = String(match.scoreLine || '').trim();
  if (score) {
    return score;
  }
  if (match.status === 'live') {
    return match.minuteLabel || 'LIVE';
  }
  if (match.status === 'ended') {
    return 'FT';
  }
  return 'VS';
}

const MatchPoster = memo(function MatchPoster({
  match,
  selected,
  focused,
  cardAccent,
  cardRef,
}: MatchPosterProps) {
  const scoreText = getCardScoreText(match);
  const hasScore = Boolean(String(match.scoreLine || '').trim());
  const matchTags = Array.isArray(match.tags) ? match.tags : [];
  const matchStreams = Array.isArray(match.streams) ? match.streams : [];
  const feedCount =
    typeof match.streamCountHint === 'number' ? match.streamCountHint : matchStreams.length;

  return (
    <button
      type="button"
      ref={cardRef}
      className={`match-poster${selected ? ' is-selected' : ''}${focused && selected ? ' is-focused' : ''}`}
      style={{ ['--accent' as string]: cardAccent }}
    >
      <div className="match-poster-topline">
        <span className={`match-pill ${getStatusClass(match.status)}`}>
          {match.status === 'live' ? match.minuteLabel || 'LIVE' : match.kickoffLabel}
        </span>
        <span className="league-label">{match.league}</span>
      </div>
      <div className="match-poster-body">
        <div>
          <div className="match-poster-clubs">
            <div className="match-poster-club">
              <TeamCrest name={match.homeTeam} logoUrl={match.homeLogoUrl} size="sm" />
              <h3 className="match-poster-title">{match.homeTeam}</h3>
            </div>
            <div className="match-poster-club">
              <TeamCrest name={match.awayTeam} logoUrl={match.awayLogoUrl} size="sm" />
              <p className="match-poster-subtitle">{match.awayTeam}</p>
            </div>
          </div>
        </div>
        <div className={`match-poster-score${hasScore ? '' : ' is-status'}`}>{scoreText}</div>
      </div>
      <p className="match-poster-summary">{match.summary}</p>
      <div className="match-poster-meta">
        <span>{match.round}</span>
        <span>{feedCount} {feedCount === 1 ? 'feed' : 'feeds'}</span>
      </div>
      <div className="match-poster-tags">
        <span className="tag-chip">{match.status === 'live' ? 'Open Sources' : 'Preview Match'}</span>
        {matchTags.slice(0, 1).map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
});

export const MatchList = memo(function MatchList({
  matches,
  selectedIndex,
  focused,
  accentBySport,
}: MatchListProps) {
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const safeMatches = Array.isArray(matches) ? matches : [];
  const safeAccentBySport = accentBySport && typeof accentBySport === 'object' ? accentBySport : {};

  useEffect(() => {
    const node = selectedCardRef.current;
    node?.scrollIntoView({
      behavior: getPreferredScrollBehavior(),
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedIndex, safeMatches.length]);

  return (
    <section className="lane-section">
      <div className="lane-section-head">
        <div>
          <span className="lane-kicker">Browse Shelf</span>
          <h2 className="lane-title">Featured fixtures</h2>
        </div>
        <span className="lane-meta">{safeMatches.length} matches</span>
      </div>
      <div className="match-track">
        {safeMatches.map((match, index) => {
          const selected = index === selectedIndex;
          const cardAccent = safeAccentBySport[match.sportId] || '#2dd4bf';
          return (
            <MatchPoster
              key={match.id}
              match={match}
              selected={selected}
              focused={focused}
              cardAccent={cardAccent}
              cardRef={selected ? selectedCardRef : undefined}
            />
          );
        })}
      </div>
    </section>
  );
});
