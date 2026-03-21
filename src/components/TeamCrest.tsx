import { useState } from 'react';

interface TeamCrestProps {
  name: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
}

function buildMonogram(name: string) {
  const parts = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return '?';
  }
  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

export function TeamCrest({
  name,
  logoUrl,
  size = 'md',
  variant = 'dark',
}: TeamCrestProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl && !failed);

  return (
    <span className={`team-crest team-crest--${size} team-crest--${variant}`}>
      {showImage ? (
        <img
          src={logoUrl}
          alt={name}
          className="team-crest-image"
          decoding="async"
          draggable={false}
          loading={size === 'lg' ? 'eager' : 'lazy'}
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <span className="team-crest-fallback">{buildMonogram(name)}</span>
      )}
    </span>
  );
}
