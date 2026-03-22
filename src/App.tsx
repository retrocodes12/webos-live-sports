import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { BrandLogo } from './components/BrandLogo';
import { DetailPanel } from './components/DetailPanel';
import { HeroSpotlight } from './components/HeroSpotlight';
import { MatchList } from './components/MatchList';
import { PlayerView } from './components/PlayerView';
import { SportsColumn } from './components/SportsColumn';
import {
  invalidateMatchStreams,
  loadMatchStreams,
  loadSportsCatalog,
  preloadMatchStreams,
} from './services/api';
import type { SportsCatalog, StreamOption } from './types';
import { isBackIntent, isLikelyWebOsRuntime } from './utils/platform';

type Screen = 'home' | 'detail' | 'player';
type HomeFocusArea = 'sports' | 'matches';
type DetailFocusArea = 'summary' | 'streams';

const EMPTY_CATALOG: SportsCatalog = {
  sports: [],
  matches: [],
};
const CATALOG_REFRESH_INTERVAL_MS = 30000;
const STREAM_PREFETCH_DELAY_MS = 220;
const ADJACENT_STREAM_PREFETCH_DELAY_MS = 650;
const EMPTY_STREAMS: StreamOption[] = [];

interface NavigationSnapshot {
  safeScreen: Screen;
  homeFocusArea: HomeFocusArea;
  detailFocusArea: DetailFocusArea;
  hasMatch: boolean;
  sportsLength: number;
  filteredMatchesLength: number;
  selectedMatchIndex: number;
  selectedStreamIndex: number;
  selectedMatchId: string;
  selectedMatchStreamsLength: number;
  selectedStreamKind: StreamOption['kind'] | null;
  hasSelectedStream: boolean;
  canRetrySelectedMatchLookup: boolean;
}

function formatClockLabel(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

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
  const [streamLookupNonceByMatchId, setStreamLookupNonceByMatchId] = useState<Record<string, number>>({});
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [lastCatalogSyncAt, setLastCatalogSyncAt] = useState<number | null>(null);
  const [lastCatalogLatencyMs, setLastCatalogLatencyMs] = useState<number | null>(null);
  const [nowLabel, setNowLabel] = useState(() => formatClockLabel());
  const catalogRef = useRef(catalog);
  const screenRef = useRef(screen);
  const catalogRequestInFlightRef = useRef(false);
  const selectedSportIdRef = useRef('');
  const selectedMatchIdRef = useRef('');
  const navigationStateRef = useRef<NavigationSnapshot>({
    safeScreen: 'home',
    homeFocusArea: 'matches',
    detailFocusArea: 'streams',
    hasMatch: false,
    sportsLength: 0,
    filteredMatchesLength: 0,
    selectedMatchIndex: 0,
    selectedStreamIndex: 0,
    selectedMatchId: '',
    selectedMatchStreamsLength: 0,
    selectedStreamKind: null,
    hasSelectedStream: false,
    canRetrySelectedMatchLookup: false,
  });
  const isTvRuntime = useMemo(() => isLikelyWebOsRuntime(), []);

  function handleBackNavigation() {
    if (screenRef.current === 'player') {
      setScreen('detail');
      return true;
    }

    if (screenRef.current === 'detail') {
      setScreen('home');
      return true;
    }

    return true;
  }

  useEffect(() => {
    document.documentElement.classList.toggle('webos-runtime', isTvRuntime);
    return () => {
      document.documentElement.classList.remove('webos-runtime');
    };
  }, [isTvRuntime]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowLabel(formatClockLabel());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const sports = catalog.sports;
  const selectedSport = sports[selectedSportIndex] || sports[0];

  const filteredMatches = useMemo(() => {
    if (!selectedSport || selectedSport.id === 'all') {
      return catalog.matches;
    }
    return catalog.matches.filter((match) => match.sportId === selectedSport.id);
  }, [catalog.matches, selectedSport]);

  const selectedMatch = filteredMatches[selectedMatchIndex] || filteredMatches[0] || null;
  const selectedMatchLookupNonce = selectedMatch
    ? streamLookupNonceByMatchId[selectedMatch.id] || 0
    : 0;
  const selectedMatchStreams = useMemo(() => {
    if (!selectedMatch) {
      return EMPTY_STREAMS;
    }

    if (Object.prototype.hasOwnProperty.call(streamsByMatchId, selectedMatch.id)) {
      return streamsByMatchId[selectedMatch.id] || EMPTY_STREAMS;
    }

    return selectedMatch.streams || EMPTY_STREAMS;
  }, [selectedMatch, streamsByMatchId]);
  const selectedMatchView = useMemo(
    () => (selectedMatch ? { ...selectedMatch, streams: selectedMatchStreams } : null),
    [selectedMatch, selectedMatchStreams]
  );
  const selectedStream = selectedMatchStreams[selectedStreamIndex] || selectedMatchStreams[0] || null;
  const safeScreen: Screen = screen === 'player' && !selectedStream ? 'detail' : screen;

  useEffect(() => {
    if (screen === 'player' && !selectedStream) {
      setScreen(selectedMatch ? 'detail' : 'home');
    }
  }, [screen, selectedMatch, selectedStream]);

  const accentBySport = useMemo(
    () =>
      sports.reduce<Record<string, string>>((accumulator, sport) => {
        accumulator[sport.id] = sport.accent;
        return accumulator;
      }, {}),
    [sports]
  );
  const selectedAccent = selectedMatch ? accentBySport[selectedMatch.sportId] || '#6f7cff' : '#6f7cff';
  const { liveCount, upcomingCount } = useMemo(
    () =>
      catalog.matches.reduce(
        (totals, match) => {
          if (match.status === 'live') {
            totals.liveCount += 1;
          } else if (match.status === 'upcoming') {
            totals.upcomingCount += 1;
          }
          return totals;
        },
        { liveCount: 0, upcomingCount: 0 }
      ),
    [catalog.matches]
  );
  const endedCount = Math.max(0, catalog.matches.length - liveCount - upcomingCount);
  const currentScreenLabel =
    safeScreen === 'home' ? 'Browse' : safeScreen === 'detail' ? 'Source Detail' : 'Player';
  const syncLabel = isRefreshingCatalog
    ? 'Refreshing the live board in the background.'
    : lastCatalogSyncAt
      ? `Last sync at ${new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(lastCatalogSyncAt))}${
          lastCatalogLatencyMs ? ` • ${lastCatalogLatencyMs} ms` : ''
        }`
      : 'Waiting for the first live sync.';
  const canRetrySelectedMatchLookup = Boolean(
    selectedMatch &&
    !loadingStreamMatchIds[selectedMatch.id] &&
    (!selectedMatchStreams.length || streamErrorsByMatchId[selectedMatch.id])
  );

  catalogRef.current = catalog;
  screenRef.current = screen;
  selectedSportIdRef.current = selectedSport?.id || '';
  selectedMatchIdRef.current = selectedMatch?.id || '';
  navigationStateRef.current = {
    safeScreen,
    homeFocusArea,
    detailFocusArea,
    hasMatch: Boolean(selectedMatch),
    sportsLength: sports.length,
    filteredMatchesLength: filteredMatches.length,
    selectedMatchIndex,
    selectedStreamIndex,
    selectedMatchId: selectedMatch?.id || '',
    selectedMatchStreamsLength: selectedMatchStreams.length,
    selectedStreamKind: selectedStream?.kind || null,
    hasSelectedStream: Boolean(selectedStream),
    canRetrySelectedMatchLookup,
  };

  function retryStreamsForMatch(matchId: string) {
    invalidateMatchStreams(matchId);
    setStreamsByMatchId((current) => {
      const next = { ...current };
      delete next[matchId];
      return next;
    });
    setStreamErrorsByMatchId((current) => ({
      ...current,
      [matchId]: '',
    }));
    setStreamLookupDoneByMatchId((current) => {
      const next = { ...current };
      delete next[matchId];
      return next;
    });
    setStreamLookupNonceByMatchId((current) => ({
      ...current,
      [matchId]: (current[matchId] || 0) + 1,
    }));
  }

  useEffect(() => {
    let cancelled = false;

    const refreshCatalog = async ({ showLoading = false } = {}) => {
      if (catalogRequestInFlightRef.current) {
        return;
      }

      catalogRequestInFlightRef.current = true;
      const requestStartedAt = performance.now();

      try {
        if (showLoading) {
          setLoading(true);
          setError('');
        } else {
          setIsRefreshingCatalog(true);
        }

        const nextCatalog = await loadSportsCatalog();
        if (!cancelled) {
          const nextLatencyMs = Math.round(performance.now() - requestStartedAt);
          startTransition(() => {
            setCatalog(nextCatalog);
          });
          setError('');
          setLastCatalogSyncAt(Date.now());
          setLastCatalogLatencyMs(nextLatencyMs);

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

          startTransition(() => {
            setSelectedSportIndex(resolvedSportIndex);
            setSelectedMatchIndex(
              clampIndex(nextMatchIndex >= 0 ? nextMatchIndex : 0, nextFilteredMatches.length)
            );
          });
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
        if (!cancelled) {
          setIsRefreshingCatalog(false);
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
        const lookupResult = await loadMatchStreams(selectedMatch.id, {
          force: selectedMatchLookupNonce > 0,
        });
        if (!cancelled) {
          startTransition(() => {
            setStreamsByMatchId((current) => ({
              ...current,
              [selectedMatch.id]: lookupResult.streams,
            }));
            setStreamLookupDoneByMatchId((current) => ({ ...current, [selectedMatch.id]: true }));
          });
        }
      } catch (nextError) {
        if (!cancelled) {
          setStreamErrorsByMatchId((current) => ({
            ...current,
            [selectedMatch.id]:
              nextError instanceof Error ? nextError.message : 'Failed to load streams',
          }));
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
  }, [screen, selectedMatch, selectedMatchLookupNonce]);

  useEffect(() => {
    if (!selectedMatch) {
      return;
    }

    if ((selectedMatch.streams || []).length > 0 || streamLookupDoneByMatchId[selectedMatch.id]) {
      return;
    }

    if (loadingStreamMatchIds[selectedMatch.id] || safeScreen === 'player') {
      return;
    }

    let cancelled = false;
    const prefetchMatchId = selectedMatch.id;
    const prefetchTimerId = window.setTimeout(() => {
      void loadMatchStreams(prefetchMatchId)
        .then((lookupResult) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setStreamsByMatchId((current) =>
              current[prefetchMatchId] === lookupResult.streams
                ? current
                : {
                    ...current,
                    [prefetchMatchId]: lookupResult.streams,
                  }
            );
            setStreamLookupDoneByMatchId((current) =>
              current[prefetchMatchId]
                ? current
                : {
                    ...current,
                    [prefetchMatchId]: true,
                  }
            );
          });
        })
        .catch(() => {});
    }, safeScreen === 'home' ? STREAM_PREFETCH_DELAY_MS : 0);

    const adjacentMatch = filteredMatches[selectedMatchIndex + 1] || null;
    const shouldPrefetchAdjacentMatch =
      safeScreen === 'home' &&
      adjacentMatch &&
      !(adjacentMatch.streams || []).length &&
      !streamLookupDoneByMatchId[adjacentMatch.id];
    const adjacentPrefetchTimerId = shouldPrefetchAdjacentMatch
      ? window.setTimeout(() => {
          if (!cancelled && adjacentMatch) {
            void preloadMatchStreams(adjacentMatch.id);
          }
        }, ADJACENT_STREAM_PREFETCH_DELAY_MS)
      : 0;

    return () => {
      cancelled = true;
      window.clearTimeout(prefetchTimerId);
      if (adjacentPrefetchTimerId) {
        window.clearTimeout(adjacentPrefetchTimerId);
      }
    };
  }, [
    filteredMatches,
    loadingStreamMatchIds,
    safeScreen,
    selectedMatch,
    selectedMatchIndex,
    streamLookupDoneByMatchId,
  ]);

  useEffect(() => {
    if (typeof window.history?.pushState !== 'function') {
      return;
    }

    const stateKey = 'sportzx-app-shell';
    const stateValue = { [stateKey]: true };

    window.history.replaceState(stateValue, '', window.location.href);
    window.history.pushState(stateValue, '', window.location.href);

    const handlePopState = () => {
      handleBackNavigation();
      window.history.pushState(stateValue, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const isBack = isBackIntent(event);
      const {
        safeScreen: currentScreen,
        homeFocusArea: currentHomeFocusArea,
        detailFocusArea: currentDetailFocusArea,
        hasMatch,
        sportsLength,
        filteredMatchesLength,
        selectedMatchIndex: currentSelectedMatchIndex,
        selectedMatchId: currentSelectedMatchId,
        selectedMatchStreamsLength,
        selectedStreamKind,
        hasSelectedStream,
        canRetrySelectedMatchLookup: canRetrySelectedMatchLookupCurrent,
      } = navigationStateRef.current;

      if (isBack) {
        event.preventDefault();
        event.stopPropagation();
        handleBackNavigation();
        return;
      }

      if (!hasMatch) {
        return;
      }

      if (currentScreen === 'home') {
        if (currentHomeFocusArea === 'sports') {
          if (key === 'ArrowUp') {
            event.preventDefault();
            setSelectedSportIndex((current) => clampIndex(current - 1, sportsLength));
            return;
          }
          if (key === 'ArrowDown') {
            event.preventDefault();
            setSelectedSportIndex((current) => clampIndex(current + 1, sportsLength));
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
            if (currentSelectedMatchIndex > 0) {
              setSelectedMatchIndex((current) => clampIndex(current - 1, filteredMatchesLength));
            } else {
              setHomeFocusArea('sports');
            }
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            setSelectedMatchIndex((current) => clampIndex(current + 1, filteredMatchesLength));
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

      if (currentScreen === 'detail') {
        if (currentDetailFocusArea === 'summary') {
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
            if (navigationStateRef.current.selectedStreamIndex > 0) {
              setSelectedStreamIndex((current) => clampIndex(current - 1, selectedMatchStreamsLength));
            } else {
              setDetailFocusArea('summary');
            }
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            setSelectedStreamIndex((current) => clampIndex(current + 1, selectedMatchStreamsLength));
            return;
          }
          if (key === 'Enter') {
            event.preventDefault();
            if (hasSelectedStream) {
              setScreen('player');
            } else if (currentSelectedMatchId && canRetrySelectedMatchLookupCurrent) {
              retryStreamsForMatch(currentSelectedMatchId);
            }
            return;
          }
        }
        return;
      }

      if (currentScreen === 'player') {
        if (selectedStreamKind === 'embed') {
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
          <span className="panel-logo-shell">
            <BrandLogo className="panel-logo" />
          </span>
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
          <span className="panel-logo-shell">
            <BrandLogo className="panel-logo" />
          </span>
          <span className="panel-kicker">No Matches</span>
          <h1>Your catalog is empty</h1>
          <p>Add authorized matches and streams to the backend payload.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-shell${safeScreen === 'player' ? ' player-shell' : ''}${isTvRuntime ? ' app-shell--tv' : ''}`}
      style={{ ['--accent' as string]: selectedAccent }}
    >
      <div className="app-ambient" aria-hidden="true">
        <div className="app-orb orb-one" />
        <div className="app-orb orb-two" />
      </div>

      {safeScreen !== 'player' ? (
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
            <span className={`status-chip status-chip--strong${isRefreshingCatalog ? ' is-pending' : ''}`}>
              {isRefreshingCatalog ? 'Refreshing' : 'Live Board'}
            </span>
            <span className="status-chip">{currentScreenLabel}</span>
            <span className="status-chip">{selectedSport?.name || 'All Sports'}</span>
            <span className="status-chip">{nowLabel}</span>
          </div>
        </header>
      ) : null}

      {safeScreen === 'home' ? (
        <main className="shell-layout">
          <SportsColumn
            sports={sports}
            selectedSportId={selectedSport.id}
            selectedIndex={selectedSportIndex}
            isFocused={homeFocusArea === 'sports'}
            liveCount={liveCount}
            upcomingCount={upcomingCount}
            endedCount={endedCount}
            screenLabel={currentScreenLabel}
            syncLabel={syncLabel}
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

      {safeScreen === 'detail' ? (
        <main className="shell-layout">
          <SportsColumn
            sports={sports}
            selectedSportId={selectedSport.id}
            selectedIndex={selectedSportIndex}
            isFocused={false}
            liveCount={liveCount}
            upcomingCount={upcomingCount}
            endedCount={endedCount}
            screenLabel={currentScreenLabel}
            syncLabel={syncLabel}
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
              canRetry={canRetrySelectedMatchLookup}
            />
          </section>
        </main>
      ) : null}

      {safeScreen === 'player' && selectedStream && selectedMatchView ? (
        <main className="player-layout">
          <PlayerView match={selectedMatchView} stream={selectedStream} />
        </main>
      ) : null}

      {safeScreen !== 'player' ? (
        <footer className="app-command-bar">
          <span><strong>Arrows</strong> move through lanes</span>
          <span><strong>Enter</strong> open selection</span>
          <span><strong>Back</strong> return</span>
          <span className="app-command-status">{syncLabel}</span>
        </footer>
      ) : null}
    </div>
  );
}
