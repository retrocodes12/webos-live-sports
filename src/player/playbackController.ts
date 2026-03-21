import type { StreamOption } from '../types';

export type PlaybackEngineName =
  | 'native-file'
  | 'native-hls'
  | 'native-dash'
  | 'hls.js'
  | 'dash.js';

interface StartManagedPlaybackOptions {
  videoElement: HTMLVideoElement;
  stream: StreamOption;
  onEngineChange?: (engine: PlaybackEngineName) => void;
  onPlaybackError?: (message: string) => void;
}

interface ManagedPlaybackSession {
  destroy: () => void;
}

type HlsModule = typeof import('hls.js');
type DashJsModule = typeof import('dashjs');

const HLS_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);
let hlsModulePromise: Promise<HlsModule> | null = null;
let dashModulePromise: Promise<DashJsModule> | null = null;

function loadHlsModule() {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js');
  }
  return hlsModulePromise;
}

function loadDashModule() {
  if (!dashModulePromise) {
    dashModulePromise = import('dashjs');
  }
  return dashModulePromise;
}

function getDashRuntime(module: DashJsModule) {
  const candidate = (
    module as DashJsModule & {
      default?: DashJsModule;
    }
  ).default;

  return candidate || module;
}

function normalizeMimeType(mimeType?: string | null) {
  return String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

function guessMimeType(url: string) {
  const raw = String(url || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw.includes('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }

  if (raw.includes('.mpd')) {
    return 'application/dash+xml';
  }

  if (raw.includes('.mp4') || raw.includes('.m4v')) {
    return 'video/mp4';
  }

  if (raw.includes('.webm')) {
    return 'video/webm';
  }

  return null;
}

function inferSourceType(stream: StreamOption) {
  if (stream.kind === 'hls') {
    return 'application/vnd.apple.mpegurl';
  }

  if (stream.kind === 'dash') {
    return 'application/dash+xml';
  }

  if (stream.kind === 'mp4') {
    return 'video/mp4';
  }

  return guessMimeType(stream.url);
}

function isLikelyHlsMimeType(mimeType?: string | null) {
  return HLS_MIME_TYPES.has(normalizeMimeType(mimeType));
}

function isLikelyDashMimeType(mimeType?: string | null) {
  return normalizeMimeType(mimeType) === 'application/dash+xml';
}

function isWebOsRuntime() {
  const scope = globalThis as typeof globalThis & {
    PalmSystem?: unknown;
    webOSSystem?: unknown;
  };

  const userAgent = String(globalThis.navigator?.userAgent || '');
  return Boolean(scope.PalmSystem || scope.webOSSystem || /web0s|webos|lg browser|smarttv/i.test(userAgent));
}

function canPlayNatively(videoElement: HTMLVideoElement, mimeType?: string | null) {
  if (!mimeType) {
    return false;
  }

  try {
    const result = String(videoElement.canPlayType(mimeType)).toLowerCase();
    return result === 'probably' || result === 'maybe';
  } catch {
    return false;
  }
}

function hasRequestHeaders(stream: StreamOption) {
  return Boolean(stream.headers && Object.keys(stream.headers).length > 0);
}

function clearVideoElement(videoElement: HTMLVideoElement) {
  try {
    videoElement.pause();
  } catch {
    // Ignore pause errors during teardown.
  }

  videoElement.removeAttribute('src');
  Array.from(videoElement.querySelectorAll('source')).forEach((node) => node.remove());
  videoElement.load();
}

function isExpectedPlayInterruption(error: unknown) {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  const name = String((error as { name?: string })?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    message.includes('interrupted by a new load request') ||
    message.includes('the play() request was interrupted')
  );
}

function attemptVideoPlay(
  videoElement: HTMLVideoElement,
  onPlaybackError?: (message: string) => void,
  errorLabel = 'Playback start rejected.'
) {
  const playPromise = videoElement.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((error: unknown) => {
      if (isExpectedPlayInterruption(error)) {
        return;
      }

      onPlaybackError?.(
        (error as { message?: string })?.message || errorLabel
      );
    });
  }
}

function applyNativeSource(
  videoElement: HTMLVideoElement,
  url: string,
  mimeType?: string | null
) {
  clearVideoElement(videoElement);

  if (mimeType) {
    const sourceNode = document.createElement('source');
    sourceNode.src = url;
    sourceNode.type = mimeType;
    videoElement.appendChild(sourceNode);
  } else {
    videoElement.src = url;
  }

  videoElement.load();
}

function buildHlsConfig(headers: Record<string, string> = {}) {
  const forwardedHeaders = Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key || '').trim(), String(value ?? '').trim()])
      .filter(([key, value]) => key && value)
  ) as Record<string, string>;

  const webOsRuntime = isWebOsRuntime();

  return {
    enableWorker: !webOsRuntime,
    lowLatencyMode: false,
    backBufferLength: webOsRuntime ? 30 : 90,
    maxBufferLength: webOsRuntime ? 18 : 30,
    maxMaxBufferLength: webOsRuntime ? 24 : 60,
    fragLoadingTimeOut: webOsRuntime ? 18000 : 20000,
    manifestLoadingTimeOut: webOsRuntime ? 18000 : 20000,
    xhrSetup: (xhr: XMLHttpRequest) => {
      Object.entries(forwardedHeaders).forEach(([headerName, headerValue]) => {
        try {
          xhr.setRequestHeader(headerName, headerValue);
        } catch {
          // Ignore blocked request headers.
        }
      });
    },
    fetchSetup: (context: { url: string }, initParams: RequestInit = {}) => {
      const requestHeaders = new Headers(initParams.headers || {});
      Object.entries(forwardedHeaders).forEach(([headerName, headerValue]) => {
        try {
          requestHeaders.set(headerName, headerValue);
        } catch {
          // Ignore blocked request headers.
        }
      });
      return new Request(context.url, {
        ...initParams,
        headers: requestHeaders,
      });
    },
  };
}

function attachDashRequestHeaders(player: any, headers: Record<string, string> = {}) {
  const forwardedHeaders = Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key || '').trim(), String(value ?? '').trim()])
      .filter(([key, value]) => key && value)
  ) as Record<string, string>;

  if (!Object.keys(forwardedHeaders).length || typeof player?.extend !== 'function') {
    return;
  }

  player.extend(
    'RequestModifier',
    () => ({
      modifyRequestHeader: (xhr: XMLHttpRequest) => {
        Object.entries(forwardedHeaders).forEach(([headerName, headerValue]) => {
          try {
            xhr.setRequestHeader(headerName, headerValue);
          } catch {
            // Ignore blocked request headers.
          }
        });
        return xhr;
      },
      modifyRequestURL: (url: string) => url,
    }),
    true
  );
}

function getEngineCandidates(
  videoElement: HTMLVideoElement,
  stream: StreamOption
): PlaybackEngineName[] {
  const sourceType = inferSourceType(stream);
  const nativeCandidatesAllowed = !hasRequestHeaders(stream);
  const candidates: PlaybackEngineName[] = [];

  const pushCandidate = (engine: PlaybackEngineName) => {
    if (!candidates.includes(engine)) {
      candidates.push(engine);
    }
  };

  if (isLikelyHlsMimeType(sourceType)) {
    if (nativeCandidatesAllowed && canPlayNatively(videoElement, 'application/vnd.apple.mpegurl')) {
      pushCandidate('native-hls');
    }
    pushCandidate('hls.js');
    if (nativeCandidatesAllowed) {
      pushCandidate('native-file');
    }
    return candidates;
  }

  if (isLikelyDashMimeType(sourceType)) {
    if (nativeCandidatesAllowed && canPlayNatively(videoElement, 'application/dash+xml')) {
      pushCandidate('native-dash');
    }
    pushCandidate('dash.js');
    if (nativeCandidatesAllowed) {
      pushCandidate('native-file');
    }
    return candidates;
  }

  pushCandidate('native-file');
  return candidates;
}

async function startWithHlsJs(
  videoElement: HTMLVideoElement,
  stream: StreamOption,
  onPlaybackError?: (message: string) => void
) {
  const { default: Hls } = await loadHlsModule();
  if (typeof Hls !== 'function' || !Hls.isSupported()) {
    throw new Error('HLS.js is not supported in this runtime.');
  }

  const hls = new Hls(buildHlsConfig(stream.headers || {}));

  const handleFatalError = (_event: string, data: { fatal?: boolean; details?: string } = {}) => {
    if (!data.fatal) {
      return;
    }
    onPlaybackError?.(data.details || 'HLS playback failed.');
  };

  hls.on(Hls.Events.ERROR, handleFatalError);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    attemptVideoPlay(videoElement, onPlaybackError, 'HLS playback could not start.');
  });
  hls.attachMedia(videoElement);
  hls.loadSource(stream.url);

  return () => {
    hls.destroy();
    clearVideoElement(videoElement);
  };
}

async function startWithDashJs(
  videoElement: HTMLVideoElement,
  stream: StreamOption,
  onPlaybackError?: (message: string) => void
) {
  const dashRuntime = getDashRuntime(await loadDashModule());
  const factory = dashRuntime?.MediaPlayer;
  if (typeof factory !== 'function') {
    throw new Error('DASH.js is not available in this runtime.');
  }

  const player = factory().create();
  attachDashRequestHeaders(player, stream.headers || {});

  const dashEvents = factory.events as unknown as Record<string, string> | undefined;
  const errorEvent = dashEvents?.ERROR;
  const readyEvent = dashEvents?.STREAM_INITIALIZED || dashEvents?.PLAYBACK_METADATA_LOADED;

  const handleDashError = (event: { error?: { message?: string } } = {}) => {
    onPlaybackError?.(event.error?.message || 'DASH playback failed.');
  };

  if (errorEvent && typeof player.on === 'function') {
    player.on(errorEvent, handleDashError);
  }

  if (readyEvent && typeof player.on === 'function') {
    player.on(readyEvent, () => {
      attemptVideoPlay(videoElement, onPlaybackError, 'DASH playback could not start.');
    });
  }

  player.initialize(videoElement, stream.url, false);

  return () => {
    try {
      if (errorEvent && typeof player.off === 'function') {
        player.off(errorEvent, handleDashError);
      }
      player.reset?.();
    } finally {
      clearVideoElement(videoElement);
    }
  };
}

function startWithNativeEngine(
  videoElement: HTMLVideoElement,
  stream: StreamOption,
  engine: PlaybackEngineName,
  onPlaybackError?: (message: string) => void
) {
  const mimeType = inferSourceType(stream);
  applyNativeSource(videoElement, stream.url, mimeType);
  attemptVideoPlay(videoElement, onPlaybackError, 'Native playback could not start.');

  return () => {
    clearVideoElement(videoElement);
  };
}

async function startWithEngine(
  engine: PlaybackEngineName,
  videoElement: HTMLVideoElement,
  stream: StreamOption,
  onPlaybackError?: (message: string) => void
) {
  if (engine === 'hls.js') {
    return startWithHlsJs(videoElement, stream, onPlaybackError);
  }

  if (engine === 'dash.js') {
    return startWithDashJs(videoElement, stream, onPlaybackError);
  }

  return startWithNativeEngine(videoElement, stream, engine, onPlaybackError);
}

export function getPlaybackEngineLabel(engine: PlaybackEngineName | 'embed' | '') {
  switch (engine) {
    case 'native-hls':
      return 'Native HLS';
    case 'native-dash':
      return 'Native DASH';
    case 'native-file':
      return 'Native Video';
    case 'hls.js':
      return 'HLS.js';
    case 'dash.js':
      return 'DASH.js';
    case 'embed':
      return 'Embedded UI';
    default:
      return 'Selecting engine';
  }
}

export function startManagedPlayback({
  videoElement,
  stream,
  onEngineChange,
  onPlaybackError,
}: StartManagedPlaybackOptions): ManagedPlaybackSession {
  let destroyed = false;
  let destroyPlayback = () => {
    clearVideoElement(videoElement);
  };

  if (stream.drm) {
    onPlaybackError?.(
      'This stream is DRM protected. The current web player does not yet include a platform DRM playback path.'
    );
    return {
      destroy: () => {
        clearVideoElement(videoElement);
      },
    };
  }

  const candidates = getEngineCandidates(videoElement, stream);
  if (!candidates.length) {
    onPlaybackError?.('No compatible playback engine was available for this stream.');
    return {
      destroy: () => {
        clearVideoElement(videoElement);
      },
    };
  }

  void (async () => {
    let lastError: Error | null = null;

    for (const engine of candidates) {
      if (destroyed) {
        return;
      }

      onEngineChange?.(engine);

      try {
        destroyPlayback = await startWithEngine(engine, videoElement, stream, onPlaybackError);
        if (destroyed) {
          destroyPlayback();
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Playback engine startup failed.');
      }
    }

    if (!destroyed) {
      onPlaybackError?.(lastError?.message || 'No compatible playback engine was available for this stream.');
    }
  })();

  return {
    destroy: () => {
      destroyed = true;
      destroyPlayback();
    },
  };
}
