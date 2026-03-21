import { useEffect, useMemo, useRef, useState } from 'react';

import { BrandLogo } from './components/BrandLogo';
import { DetailPanel } from './components/DetailPanel';
import { HeroSpotlight } from './components/HeroSpotlight';
import { MatchList } from './components/MatchList';
import { PlayerView } from './components/PlayerView';
import { SportsColumn } from './components/SportsColumn';
import { loadMatchStreams, loadSportsCatalog } from './services/api';
import type { SportsCatalog, StreamOption } from './types';

type Screen = 'home' | 'detail' | 'player';
type HomeFocusArea = 'sports' | 'matches';
type DetailFocusArea = 'summary' | 'streams';

const EMPTY_CATALOG: SportsCatalog = {
  sports: [],
  matches: [],
};
const CATALOG_REFRESH_INTERVAL_MS = 30000;

function clampIndex(value: number, length: number) {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(value, 0), length - 1);
}

export default function App() {
  const [catalog, setCatalog] = useState<SportsCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [screen, setScreen] = useState<Screen>('home');
  const [selectedSportIndex, setSelectedSportIndex] = useState(0);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [selectedStreamIndex, setSelectedStreamIndex] = useState(0);
  const [homeFocusArea, setHomeFocusArea] = useState<HomeFocusArea>('matches');
  const [detailFocusArea, setDetailFocusArea] = useState<DetailFocusArea>('streams');
  const [streamsByMatchId, setStreamsByMatchId] = useState<Record<string, StreamOption[]>>({});
  const [streamErrorsByMatchId, setStreamErrorsByMatchId] = useState<Record<string, string>>({});
  const [loadingStreamMatchIds, setLoadingStreamMatchIds] = useState<Record<string, boolean>>({});
  const [streamLookupDoneByMatchId, setStreamLookupDoneByMatchId] = useState<Record<string, boolean>>({});
  const catalogRef = useRef(catalog);
  const screenRef = useRef(screen);
  const catalogRequestInFlightRef = useRef(false);
  const selectedSportIdRef = useRef('');
  const selectedMatchIdRef = useRef('');

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const sports = catalog.sports;
  const selectedSport = sports[selectedSportIndex] || sports[0];

  const filteredMatches = useMemo(() => {
    if (!selectedSport || selectedSport.id === 'all') {
      return catalog.matches;
    }
    return catalog.matches.filter((match) => match.sportId === selectedSport.id);
  }, [catalog.matches, selectedSport]);

  const selectedMatch = filteredMatches[selectedMatchIndex] || filteredMatches[0] || null;
  const hasResolvedSelectedMatchStreams = selectedMatch
    ? Object.prototype.hasOwnProperty.call(streamsByMatchId, selectedMatch.id)
    : false;
  const selectedMatchStreams = selectedMatch
    ? hasResolvedSelectedMatchStreams
      ? streamsByMatchId[selectedMatch.id]
      : selectedMatch.streams || []
    : [];
  const selectedMatchView = selectedMatch
    ? { ...selectedMatch, streams: selectedMatchStreams }
    : null;
  const selectedStream = selectedMatchStreams[selectedStreamIndex] || selectedMatchStreams[0] || null;

  useEffect(() => {
    selectedSportIdRef.current = selectedSport?.id || '';
  }, [selectedSport?.id]);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatch?.id || '';
  }, [selectedMatch?.id]);

  const accentBySport = useMemo(
    () =>
      sports.reduce<Record<string, string>>((accumulator, sport) => {
        accumulator[sport.id] = sport.accent;
        return accumulator;
      }, {}),
    [sports]
  );
  const selectedAccent = selectedMatch ? accentBySport[selectedMatch.sportId] || '#6f7cff' : '#6f7cff';

  useEffect(() => {
    let cancelled = false;

    const refreshCatalog = async ({ showLoading = false } = {}) => {
      if (catalogRequestInFlightRef.current) {
        return;
      }

      catalogRequestInFlightRef.current = true;

      try {
        if (showLoading) {
          setLoading(true);
          setError('');
        }

        const nextCatalog = await loadSportsCatalog();
        if (!cancelled) {
          setCatalog(nextCatalog);
          setError('');

          const nextSportId = selectedSportIdRef.current;
          const nextSportIndex = nextSportId
            ? nextCatalog.sports.findIndex((sport) => sport.id === nextSportId)
            : 0;
          const resolvedSportIndex = clampIndex(
            nextSportIndex >= 0 ? nextSportIndex : 0,
            nextCatalog.sports.length
          );
          const nextSelectedSport =
            nextCatalog.sports[resolvedSportIndex] || nextCatalog.sports[0];
          const nextFilteredMatches =
            !nextSelectedSport || nextSelectedSport.id === 'all'
              ? nextCatalog.matches
              : nextCatalog.matches.filter((match) => match.sportId === nextSelectedSport.id);
          const nextMatchId = selectedMatchIdRef.current;
          const nextMatchIndex = nextMatchId
            ? nextFilteredMatches.findIndex((match) => match.id === nextMatchId)
            : 0;

          setSelectedSportIndex(resolvedSportIndex);
          setSelectedMatchIndex(
            clampIndex(nextMatchIndex >= 0 ? nextMatchIndex : 0, nextFilteredMatches.length)
          );
        }
      } catch (nextError) {
        if (
          !cancelled &&
          !catalogRef.current.sports.length &&
          !catalogRef.current.matches.length
        ) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load sports catalog');
        }
      } finally {
        catalogRequestInFlightRef.current = false;
        if (!cancelled && showLoading) {
          setLoading(false);
        }
      }
    };

    const handleForegroundRefresh = () => {
      if (document.visibilityState === 'visible' && screenRef.current !== 'player') {
        void refreshCatalog();
      }
    };

    void refreshCatalog({ showLoading: true });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || screenRef.current === 'player') {
        return;
      }

      void refreshCatalog();
    }, CATALOG_REFRESH_INTERVAL_MS);

    window.addEventListener('focus', handleForegroundRefresh);
    document.addEventListener('visibilitychange', handleForegroundRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleForegroundRefresh);
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
    };
  }, []);

  useEffect(() => {
    setSelectedMatchIndex((current) => clampIndex(current, filteredMatches.length));
  }, [filteredMatches.length]);

  useEffect(() => {
    setSelectedStreamIndex((current) => clampIndex(current, selectedMatchStreams.length || 0));
  }, [selectedMatch?.id, selectedMatchStreams.length]);

  useEffect(() => {
    let cancelled = false;

    const hydrateStreams = async () => {
      if (!selectedMatch || screen === 'home') {
        return;
      }

      if ((selectedMatch.streams || []).length > 0 || streamLookupDoneByMatchId[selectedMatch.id]) {
        return;
      }

      if (loadingStreamMatchIds[selectedMatch.id]) {
        return;
      }

      try {
        setLoadingStreamMatchIds((current) => ({ ...current, [selectedMatch.id]: true }));
        setStreamErrorsByMatchId((current) => ({ ...current, [selectedMatch.id]: '' }));
        const streams = await loadMatchStreams(selectedMatch.id);
        if (!cancelled) {
          setStreamsByMatchId((current) => ({ ...current, [selectedMatch.id]: streams }));
          setStreamLookupDoneByMatchId((current) => ({ ...current, [selectedMatch.id]: true }));
        }
      } catch (nextError) {
        if (!cancelled) {
          setStreamErrorsByMatchId((current) => ({
            ...current,
            [selectedMatch.id]:
              nextError instanceof Error ? nextError.message : 'Failed to load streams',
          }));
          setStreamLookupDoneByMatchId((current) => ({ ...current, [selectedMatch.id]: true }));
        }
      } finally {
        if (!cancelled) {
          setLoadingStreamMatchIds((current) => ({ ...current, [selectedMatch.id]: false }));
        }
      }
    };

    void hydrateStreams();

    return () => {
      cancelled = true;
    };
  }, [screen, selectedMatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const isBack = key === 'Backspace' || key === 'Escape' || event.keyCode === 461;
      const hasMatch = Boolean(selectedMatch);

      if (isBack) {
        event.preventDefault();
        if (screen === 'player') {
          setScreen('detail');
        } else if (screen === 'detail') {
          setScreen('home');
        }
        return;
      }

      if (!hasMatch) {
        return;
      }

      if (screen === 'home') {
        if (homeFocusArea === 'sports') {
          if (key === 'ArrowUp') {
            event.preventDefault();
            setSelectedSportIndex((current) => clampIndex(current - 1, sports.length));
            return;
          }
          if (key === 'ArrowDown') {
            event.preventDefault();
            setSelectedSportIndex((current) => clampIndex(current + 1, sports.length));
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            setHomeFocusArea('matches');
            return;
          }
        } else {
          if (key === 'ArrowLeft') {
            event.preventDefault();
            if (selectedMatchIndex > 0) {
              setSelectedMatchIndex((current) => clampIndex(current - 1, filteredMatches.length));
            } else {
              setHomeFocusArea('sports');
            }
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            setSelectedMatchIndex((current) => clampIndex(current + 1, filteredMatches.length));
            return;
          }
          if (key === 'ArrowUp') {
            event.preventDefault();
            setHomeFocusArea('sports');
            return;
          }
          if (key === 'Enter') {
            event.preventDefault();
            setScreen('detail');
            setDetailFocusArea('streams');
            return;
          }
        }
        return;
      }

      if (screen === 'detail') {
        if (detailFocusArea === 'summary') {
          if (key === 'ArrowRight' || key === 'ArrowDown') {
            event.preventDefault();
            setDetailFocusArea('streams');
            return;
          }
        } else {
          if (key === 'ArrowUp') {
            event.preventDefault();
            setDetailFocusArea('summary');
            return;
          }
          if (key === 'ArrowLeft') {
            event.preventDefault();
            if (selectedStreamIndex > 0) {
              setSelectedStreamIndex((current) => clampIndex(current - 1, selectedMatchStreams.length));
            } else {
              setDetailFocusArea('summary');
            }
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            setSelectedStreamIndex((current) => clampIndex(current + 1, selectedMatchStreams.length));
            return;
          }
          if (key === 'Enter') {
            event.preventDefault();
            if (selectedStream) {
              setScreen('player');
            }
            return;
          }
        }
        return;
      }

      if (screen === 'player') {
        if (selectedStream?.kind === 'embed') {
          if (key === 'Enter') {
            event.preventDefault();
            const embedFrame = document.querySelector('.player-embed') as HTMLIFrameElement | null;
            embedFrame?.focus();
          }
          return;
        }

        const video = document.querySelector('.player-video') as HTMLVideoElement | null;

        if (key === 'Enter') {
          event.preventDefault();
          if (!video) {
            return;
          }
          if (video.paused) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
          return;
        }

        if (key === 'ArrowLeft') {
          event.preventDefault();
          if (video) {
            video.currentTime = Math.max(0, video.currentTime - 15);
          }
          return;
        }

        if (key === 'ArrowRight') {
          event.preventDefault();
          if (video) {
            video.currentTime = Math.min(video.duration || video.currentTime + 15, video.currentTime + 15);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    detailFocusArea,
    filteredMatches.length,
    homeFocusArea,
    screen,
    selectedMatch,
    selectedMatchStreams.length,
    selectedStream,
    sports.length,
  ]);

  const nowLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="panel loading-panel">
          <span className="panel-logo-shell">
            <BrandLogo className="panel-logo" />
          </span>
          <span className="panel-kicker">sportzx</span>
          <h1>Loading your sports desk</h1>
          <p>Refreshing the live sports catalog.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="panel error-panel">
          <span className="panel-kicker">Catalog Error</span>
          <h1>Feed directory unavailable</h1>
          <p>{error}</p>
          <p className="error-hint">
            Set <code>VITE_SPORTS_API_BASE_URL</code> to your authorized backend, or use the built-in mock catalog.
          </p>
        </div>
      </div>
    );
  }

  if (!selectedMatch || !selectedSport) {
    return (
      <div className="app-shell">
        <div className="panel error-panel">
          <span className="panel-kicker">No Matches</span>
          <h1>Your catalog is empty</h1>
          <p>Add authorized matches and streams to the backend payload.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell${screen === 'player' ? ' player-shell' : ''}`} style={{ ['--accent' as string]: selectedAccent }}>
      <div className="app-ambient" aria-hidden="true">
        <div className="app-orb orb-one" />
        <div className="app-orb orb-two" />
      </div>

      {screen !== 'player' ? (
        <header className="app-header">
          <div className="brand-lockup">
            <span className="brand-mark">
              <BrandLogo className="brand-logo" />
            </span>
            <div className="brand-copy">
              <span className="brand-subtitle">Private Source Sports</span>
              <h1 className="brand-title">sportzx</h1>
            </div>
          </div>
          <div className="header-meta">
            <span className="status-chip">webOS remote UI</span>
            <span className="status-chip">{nowLabel}</span>
          </div>
        </header>
      ) : null}

      {screen === 'home' ? (
        <main className="shell-layout">
          <SportsColumn
            sports={sports}
            selectedSportId={selectedSport.id}
            selectedIndex={selectedSportIndex}
            isFocused={homeFocusArea === 'sports'}
          />
          <section className="home-stage">
            <HeroSpotlight
              match={selectedMatchView || selectedMatch}
              accent={selectedAccent}
              streamCount={selectedMatchStreams.length || selectedMatch.streamCountHint || 0}
            />
            <MatchList
              matches={filteredMatches}
              selectedIndex={selectedMatchIndex}
              focused={homeFocusArea === 'matches'}
              accentBySport={accentBySport}
            />
          </section>
        </main>
      ) : null}

      {screen === 'detail' ? (
        <main className="shell-layout">
          <SportsColumn
            sports={sports}
            selectedSportId={selectedSport.id}
            selectedIndex={selectedSportIndex}
            isFocused={false}
          />
          <section className="detail-stage">
            <HeroSpotlight
              match={selectedMatchView || selectedMatch}
              accent={selectedAccent}
              streamCount={selectedMatchStreams.length || selectedMatch.streamCountHint || 0}
              mode="detail"
              selectedStream={selectedStream}
            />
            <DetailPanel
              match={selectedMatchView || selectedMatch}
              streamIndex={selectedStreamIndex}
              streamsFocused={detailFocusArea === 'streams'}
              accent={selectedAccent}
              isLoadingStreams={Boolean(loadingStreamMatchIds[selectedMatch.id])}
              streamError={streamErrorsByMatchId[selectedMatch.id] || ''}
            />
          </section>
        </main>
      ) : null}

      {screen === 'player' && selectedStream && selectedMatchView ? (
        <main className="player-layout">
          <PlayerView match={selectedMatchView} stream={selectedStream} />
        </main>
      ) : null}
    </div>
  );
}
