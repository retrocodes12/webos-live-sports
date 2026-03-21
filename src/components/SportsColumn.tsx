import type { SportCategory } from '../types';

interface SportsColumnProps {
  sports: SportCategory[];
  selectedSportId: string;
  selectedIndex: number;
  isFocused: boolean;
}

export function SportsColumn({
  sports,
  selectedSportId,
  selectedIndex,
  isFocused,
}: SportsColumnProps) {
  return (
    <aside className="sidebar-rail">
      <div className="sidebar-surface">
        <div className="sidebar-brand-block">
          <span className="sidebar-caption">Sports TV</span>
          <h2 className="sidebar-heading">sportzx</h2>
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
      </div>
    </aside>
  );
}
