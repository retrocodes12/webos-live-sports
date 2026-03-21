import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getPlaybackEngineLabel,
  startManagedPlayback,
  type PlaybackEngineName,
} from '../player/playbackController';
import type { MatchCardData, StreamOption } from '../types';

interface PlayerViewProps {
  match: MatchCardData;
  stream: StreamOption;
}

function formatClock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlayerView({ match, stream }: PlayerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeEngine, setActiveEngine] = useState<PlaybackEngineName | 'embed' | ''>('');

  const streamLabel = useMemo(
    () => `${stream.provider} • ${stream.label} • ${stream.quality}`,
    [stream.label, stream.provider, stream.quality]
  );
  const isEmbed = stream.kind === 'embed';

  useEffect(() => {
    if (isEmbed) {
      setActiveEngine('embed');
      setPlaybackError('');
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      const timeoutId = window.setTimeout(() => {
        setPlaybackError(
          'This embedded provider did not render inside the app. Try another feed or return to the stream list.'
        );
      }, 8000);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    setActiveEngine('');
    setPlaybackError('');
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsReady(true);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };
    const handlePlay = () => {
      setIsPlaying(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handleError = () => {
      setPlaybackError((current) =>
        current ||
        'This feed could not start in the internal player. Try another source or return to the stream list.'
      );
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    const session = startManagedPlayback({
      videoElement: video,
      stream,
      onEngineChange: (engine) => {
        setActiveEngine(engine);
      },
      onPlaybackError: (message) => {
        setPlaybackError(message);
      },
    });

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      session.destroy();
    };
  }, [isEmbed, stream]);

  return (
    <section className="player-screen">
      <div className="player-frame">
        {isEmbed ? (
          <iframe
            ref={iframeRef}
            className="player-embed"
            src={stream.url}
            title={streamLabel}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            loading="eager"
            tabIndex={0}
            sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setIsReady(true);
              setPlaybackError('');
              requestAnimationFrame(() => {
                iframeRef.current?.focus();
              });
            }}
          />
        ) : (
          <video
            ref={videoRef}
            className="player-video"
            controls
            playsInline
            preload="auto"
          />
        )}
        <div className="player-overlay">
          <div>
            <span className="panel-kicker">Now Playing</span>
            <h2>{match.title}</h2>
            <p>{streamLabel}</p>
          </div>
          <div className="player-stats">
            <span>{isEmbed ? (isReady ? 'Embedded Ready' : 'Embedded Loading') : isReady ? 'Ready' : 'Buffering'}</span>
            <span>{getPlaybackEngineLabel(activeEngine)}</span>
            <span>{isEmbed ? 'External UI' : isPlaying ? 'Playing' : 'Paused'}</span>
            <span>
              {isEmbed ? 'Press Enter to focus provider controls' : `${formatClock(currentTime)} / ${formatClock(duration)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="panel player-help">
        <div className="panel-header compact">
          <span className="panel-kicker">Remote Guide</span>
          <h3>Controls</h3>
        </div>
        <div className="help-grid">
          <div>
            <strong>Enter</strong>
            <span>{isEmbed ? 'Focus the embedded provider controls' : 'Play / Pause'}</span>
          </div>
          <div>
            <strong>Left / Right</strong>
            <span>{isEmbed ? 'Unavailable for embedded players' : 'Seek in the current feed'}</span>
          </div>
          <div>
            <strong>Engine</strong>
            <span>{isEmbed ? 'Provider UI' : getPlaybackEngineLabel(activeEngine)}</span>
          </div>
          <div>
            <strong>Back / Esc</strong>
            <span>Return to feed selection</span>
          </div>
        </div>
        {playbackError ? <p className="player-error">{playbackError}</p> : null}
      </div>
    </section>
  );
}
