import { useEffect, useRef } from 'react';

import type { MatchCardData, StreamOption } from '../types';
import { getPreferredScrollBehavior } from '../utils/platform';

interface DetailPanelProps {
  match: MatchCardData;
  streamIndex: number;
  streamsFocused: boolean;
  accent: string;
  isLoadingStreams?: boolean;
  streamError?: string;
  canRetry?: boolean;
}

export function DetailPanel({
  match,
  streamIndex,
  streamsFocused,
  accent,
  isLoadingStreams = false,
  streamError = '',
  canRetry = false,
}: DetailPanelProps) {
  const streamRefs = useRef<Array<HTMLDivElement | null>>([]);
  const matchStreams = Array.isArray(match.streams) ? match.streams : [];
  const streamCount = matchStreams.length > 0 ? matchStreams.length : match.streamCountHint || 0;
  const streamHeading = isLoadingStreams && streamCount === 0 ? 'Resolving...' : `${streamCount} feeds`;

  useEffect(() => {
    const node = streamRefs.current[streamIndex];
    node?.scrollIntoView({
      behavior: getPreferredScrollBehavior(),
      block: 'nearest',
      inline: 'center',
    });
  }, [streamIndex]);

  return (
    <section className="sources-panel" style={{ ['--accent' as string]: accent }}>
      <div className="sources-head">
        <div>
          <span className="sources-kicker">Source Selection</span>
          <h3 className="sources-title">Choose a stream</h3>
        </div>
        <span className="sources-meta">
          {streamsFocused ? 'Source lane focused' : 'Press down or right to browse'}
          <strong>{streamHeading}</strong>
        </span>
      </div>

      <div className="stream-track">
        {isLoadingStreams ? (
          <div className="stream-state-card">
            <strong>Loading stream links...</strong>
            <p>The resolver is walking the provider pages and collecting playable feeds for this event.</p>
          </div>
        ) : null}

        {!isLoadingStreams && streamError ? (
          <div className="stream-state-card error">
            <strong>Stream lookup failed</strong>
            <p>{streamError}</p>
            {canRetry ? (
              <span className="stream-state-hint">Press Enter to try this lookup again.</span>
            ) : null}
          </div>
        ) : null}

        {!isLoadingStreams && !streamError && matchStreams.length === 0 ? (
          <div className="stream-state-card">
            <strong>No streams found</strong>
            <p>This match did not return any playable sources from the configured resolver.</p>
            {canRetry ? (
              <span className="stream-state-hint">Press Enter to ask the backend for sources again.</span>
            ) : null}
          </div>
        ) : null}

        {matchStreams.map((stream, index) => {
          const selected = index === streamIndex;
          return (
            <div
              key={stream.id}
              ref={(node) => {
                streamRefs.current[index] = node;
              }}
              className={`stream-card${selected ? ' is-selected' : ''}${streamsFocused && selected ? ' is-focused' : ''}`}
            >
              <div className="stream-card-topline">
                <strong>{stream.label}</strong>
                <span className="stream-quality">{stream.quality}</span>
              </div>
              <div className="stream-card-body">
                <div>
                  <div className="stream-card-provider">{stream.provider}</div>
                  <p className="stream-card-note">
                    {stream.notes || 'Provider lane ready. Open this feed to attempt playback.'}
                  </p>
                </div>
                <div className="stream-card-tags">
                  <span className="stream-tag">{stream.language}</span>
                  <span className="stream-tag">{stream.kind.toUpperCase()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
