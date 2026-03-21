import { BrandLogo } from './BrandLogo';
import type { SportCategory } from '../types';

interface SportsColumnProps {
  sports: SportCategory[];
  selectedSportId: string;
  selectedIndex: number;
  isFocused: boolean;
  liveCount: number;
  upcomingCount: number;
  endedCount: number;
  screenLabel: string;
  syncLabel: string;
}

export function SportsColumn({
  sports,
  selectedSportId,
  selectedIndex,
  isFocused,
  liveCount,
  upcomingCount,
  endedCount,
  screenLabel,
  syncLabel,
}: SportsColumnProps) {
  return (
    <aside className="sidebar-rail">
      <div className="sidebar-surface">
        <div className="sidebar-brand-block">
          <span className="sidebar-brand-mark">
            <BrandLogo className="brand-logo" />
          </span>
          <div className="sidebar-brand-copy">
            <span className="sidebar-caption">Sports TV</span>
            <h2 className="sidebar-heading">sportzx</h2>
          </div>
        </div>
        <div className="sidebar-overview">
          <div className="sidebar-overview-card">
            <span className="sidebar-overview-label">Live</span>
            <strong>{liveCount}</strong>
          </div>
          <div className="sidebar-overview-card">
            <span className="sidebar-overview-label">Up Next</span>
            <strong>{upcomingCount}</strong>
          </div>
          <div className="sidebar-overview-card">
            <span className="sidebar-overview-label">Ended</span>
            <strong>{endedCount}</strong>
          </div>
        </div>
        <div className="sidebar-list">
          {sports.map((sport, index) => {
            const active = sport.id === selectedSportId;
            const focused = isFocused && index === selectedIndex;
            return (
              <button
                key={sport.id}
                type="button"
                className={`sidebar-tile${active ? ' is-active' : ''}${focused ? ' is-focused' : ''}`}
                style={{ ['--accent' as string]: sport.accent }}
              >
                <span className="sidebar-tile-icon">{sport.shortLabel}</span>
                <span className="sidebar-tile-copy">
                  <span className="sidebar-tile-name">{sport.name}</span>
                  <span className="sidebar-tile-meta">{active ? 'Selected lane' : 'Open lane'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="sidebar-status-card">
          <span className="sidebar-caption">Session</span>
          <strong>{screenLabel}</strong>
          <p>{syncLabel}</p>
        </div>
      </div>
    </aside>
  );
}
