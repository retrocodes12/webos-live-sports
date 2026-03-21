import { useEffect, useRef } from 'react';

import { TeamCrest } from './TeamCrest';
import type { MatchCardData } from '../types';

interface MatchListProps {
  matches: MatchCardData[];
  selectedIndex: number;
  focused: boolean;
  accentBySport: Record<string, string>;
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

export function MatchList({
  matches,
  selectedIndex,
  focused,
  accentBySport,
}: MatchListProps) {
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const node = cardRefs.current[selectedIndex];
    node?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedIndex]);

  return (
    <section className="lane-section">
      <div className="lane-section-head">
        <div>
          <span className="lane-kicker">Match Lanes</span>
          <h2 className="lane-title">Live and upcoming fixtures</h2>
        </div>
        <span className="lane-meta">{matches.length} matches</span>
      </div>
      <div className="match-track">
        {matches.map((match, index) => {
          const selected = index === selectedIndex;
          const cardAccent = accentBySport[match.sportId] || '#2dd4bf';
          const scoreText = getCardScoreText(match);
          const hasScore = Boolean(String(match.scoreLine || '').trim());
          return (
            <button
              key={match.id}
              type="button"
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
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
              <div className="match-poster-tags">
                {match.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
