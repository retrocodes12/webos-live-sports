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

function formatStreamKindLabel(kind: StreamOption['kind']) {
  if (kind === 'hls') {
    return 'HLS';
  }
  if (kind === 'dash') {
    return 'DASH';
  }
  if (kind === 'mp4') {
    return 'MP4';
  }
  return 'Embed';
}

export function PlayerView({ match, stream }: PlayerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeEngine, setActiveEngine] = useState<PlaybackEngineName | 'embed' | ''>('');

  const streamLabel = useMemo(
    () => `${stream.provider} • ${stream.label} • ${stream.quality}`,
    [stream.label, stream.provider, stream.quality]
  );
  const isEmbed = stream.kind === 'embed';
  const playerStatusLabel = useMemo(() => {
    if (playbackError) {
      return 'Playback Issue';
    }
    if (hasEnded) {
      return 'Ended';
    }
    if (isBuffering) {
      return isEmbed ? 'Loading Provider' : 'Buffering';
    }
    if (isPlaying) {
      return 'Playing';
    }
    if (isReady) {
      return isEmbed ? 'Provider Ready' : 'Ready';
    }
    return 'Starting';
  }, [hasEnded, isBuffering, isEmbed, isPlaying, isReady, playbackError]);
  const timelineLabel = useMemo(() => {
    if (isEmbed) {
      return 'Press Enter to focus provider controls';
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return match.status === 'live' ? 'Live feed' : formatClock(currentTime);
    }
    return `${formatClock(currentTime)} / ${formatClock(duration)}`;
  }, [currentTime, duration, isEmbed, match.status]);
  const sourceTypeLabel = formatStreamKindLabel(stream.kind);
  const sourceNotes =
    stream.notes ||
    (isEmbed
      ? 'Embedded provider pages are blocked inside the app because they tend to trigger popups, redirects, and hostile overlays.'
      : 'This source uses the internal player and remote transport controls.');

  useEffect(() => {
    if (isEmbed) {
      setActiveEngine('embed');
      setPlaybackError(
        'Embedded provider pages are blocked inside the app because they trigger popups and redirects. Return to the source list and choose a direct feed when available.'
      );
      setIsReady(false);
      setIsPlaying(false);
      setIsBuffering(false);
      setHasEnded(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    setActiveEngine('');
    setPlaybackError('');
    setIsReady(false);
    setIsPlaying(false);
    setIsBuffering(true);
    setHasEnded(false);
    setCurrentTime(0);
    setDuration(0);

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setIsReady(true);
    };
    const handleCanPlay = () => {
      setIsReady(true);
      setIsBuffering(false);
      setPlaybackError('');
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };
    const handlePlay = () => {
      setIsPlaying(true);
    };
    const handlePlaying = () => {
      setIsReady(true);
      setIsPlaying(true);
      setIsBuffering(false);
      setHasEnded(false);
      setPlaybackError('');
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handleWaiting = () => {
      setIsBuffering(true);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setHasEnded(true);
    };
    const handleError = () => {
      setIsBuffering(false);
      setPlaybackError((current) =>
        current ||
        'This feed could not start in the internal player. Try another source or return to the stream list.'
      );
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleWaiting);
    video.addEventListener('ended', handleEnded);
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
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleWaiting);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      session.destroy();
    };
  }, [isEmbed, stream]);

  return (
    <section className="player-screen">
      <div className="player-frame">
        {isEmbed ? (
          <div className="player-embed-blocked">
            <span className="panel-kicker">Embedded Provider Blocked</span>
            <h2>Popup-prone source disabled</h2>
            <p>
              This source is an external embed page, not a direct media stream. The app blocks it to avoid popups,
              redirects, and hostile overlays on the TV.
            </p>
            <p>Return to the source list and choose an `HLS`, `MP4`, or `DASH` feed when available.</p>
          </div>
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
            <span>{playerStatusLabel}</span>
            <span>{getPlaybackEngineLabel(activeEngine)}</span>
            <span>{isEmbed ? 'External UI' : hasEnded ? 'Session Ended' : isPlaying ? 'Live Playback' : 'Ready State'}</span>
            <span>{timelineLabel}</span>
          </div>
        </div>
        {playbackError ? (
          <div className="player-error-banner">
            <strong>Playback issue</strong>
            <span>{playbackError}</span>
          </div>
        ) : null}
      </div>

      <aside className="player-sidebar">
        <div className="panel player-summary">
          <div className="panel-header compact">
            <span className="panel-kicker">Source Summary</span>
            <h3>Now playing</h3>
          </div>
          <div className="player-summary-grid">
            <div className="player-summary-card">
              <span className="player-summary-label">Provider</span>
              <strong>{stream.provider}</strong>
            </div>
            <div className="player-summary-card">
              <span className="player-summary-label">Feed</span>
              <strong>{stream.label}</strong>
            </div>
            <div className="player-summary-card">
              <span className="player-summary-label">Format</span>
              <strong>{sourceTypeLabel}</strong>
            </div>
            <div className="player-summary-card">
              <span className="player-summary-label">Quality</span>
              <strong>{stream.quality}</strong>
            </div>
            <div className="player-summary-card">
              <span className="player-summary-label">Language</span>
              <strong>{stream.language}</strong>
            </div>
            <div className="player-summary-card">
              <span className="player-summary-label">Access</span>
              <strong>{stream.authorized ? 'Authorized' : 'Unknown'}</strong>
            </div>
          </div>
          <p className="player-summary-note">{sourceNotes}</p>
        </div>

        <div className="panel player-help">
          <div className="panel-header compact">
            <span className="panel-kicker">Remote Guide</span>
            <h3>Controls</h3>
          </div>
          <div className="help-grid">
            <div>
              <strong>Enter</strong>
              <span>{isEmbed ? 'Focus the embedded provider controls' : 'Play or pause the current feed'}</span>
            </div>
            <div>
              <strong>Left / Right</strong>
              <span>{isEmbed ? 'Unavailable for embedded players' : 'Seek through the current feed'}</span>
            </div>
            <div>
              <strong>Back</strong>
              <span>Return to the source shelf</span>
            </div>
            <div>
              <strong>Status</strong>
              <span>{playerStatusLabel}</span>
            </div>
          </div>
          {playbackError ? <p className="player-error">{playbackError}</p> : null}
        </div>
      </aside>
    </section>
  );
}
