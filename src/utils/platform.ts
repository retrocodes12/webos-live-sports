const WEBOS_RUNTIME_PATTERN = /web0s|webos|lg browser|smarttv/i;

export function isLikelyWebOsRuntime() {
  const scope = globalThis as typeof globalThis & {
    PalmSystem?: unknown;
    webOSSystem?: unknown;
  };

  const userAgent = String(globalThis.navigator?.userAgent || '');
  return Boolean(scope.PalmSystem || scope.webOSSystem || WEBOS_RUNTIME_PATTERN.test(userAgent));
}

export function getPreferredScrollBehavior(): ScrollBehavior {
  return isLikelyWebOsRuntime() ? 'auto' : 'smooth';
}

export function isBackIntent(event: KeyboardEvent) {
  return (
    event.key === 'Backspace' ||
    event.key === 'Escape' ||
    event.key === 'GoBack' ||
    event.key === 'BrowserBack' ||
    event.keyCode === 461
  );
}
