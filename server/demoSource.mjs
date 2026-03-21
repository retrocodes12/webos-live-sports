const DEMO_HLS_MAIN = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const DEMO_HLS_ALT = 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8';

const matchPages = {
  'manual-football-1': {
    sportId: 'football',
    title: 'Brighton & Hove Albion vs Liverpool',
    homeTeam: 'Brighton & Hove Albion',
    awayTeam: 'Liverpool',
    league: 'Premier League Demo',
    round: 'Matchday 29',
    venue: 'Amex Stadium',
    status: 'live',
    kickoffLabel: 'Started 12:30',
    minuteLabel: "54'",
    scoreLine: '1 - 0',
    tags: ['Demo Source', 'English'],
    providers: [
      {
        slug: 'world-feed',
        label: 'TNT Sports 1 UK',
        quality: '1080p',
        language: 'English',
      },
      {
        slug: 'studio-embed',
        label: 'Studio Embed',
        quality: 'Auto',
        language: 'English',
      },
    ],
  },
  'manual-cricket-1': {
    sportId: 'cricket',
    title: 'Kingsport vs Harbor XI',
    homeTeam: 'Kingsport',
    awayTeam: 'Harbor XI',
    league: 'Curated Match Board',
    round: 'Night Fixture',
    venue: 'Lotus Stadium',
    status: 'upcoming',
    kickoffLabel: 'Today 20:30',
    scoreLine: '0 - 0',
    tags: ['Resolver Ready', 'Hindi', 'English'],
    providers: [
      {
        slug: 'stadium-feed',
        label: 'Stadium Feed',
        quality: '1080p',
        language: 'English',
      },
      {
        slug: 'hindi-feed',
        label: 'Hindi Commentary',
        quality: '720p',
        language: 'Hindi',
      },
    ],
  },
  'manual-basketball-1': {
    sportId: 'basketball',
    title: 'Metro Blaze vs Coastline',
    homeTeam: 'Metro Blaze',
    awayTeam: 'Coastline',
    league: 'Curated Match Board',
    round: 'Prime Time',
    venue: 'Summit Pavilion',
    status: 'live',
    kickoffLabel: 'Started 21:00',
    minuteLabel: 'Q4 03:40',
    scoreLine: '104 - 101',
    tags: ['Manual Event', 'Resolver'],
    providers: [
      {
        slug: 'national-feed',
        label: 'National Feed',
        quality: '1080p60',
        language: 'English',
      },
      {
        slug: 'backboard-cam',
        label: 'Backboard Cam',
        quality: '720p',
        language: 'Natural Sound',
      },
    ],
  },
};

function pageTemplate(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Arial, sans-serif;
        background: #07131d;
        color: #f8fafc;
      }
      body {
        margin: 0;
        padding: 24px;
      }
      h1, h2, h3, p {
        margin-top: 0;
      }
      .page-shell {
        max-width: 1100px;
        margin: 0 auto;
      }
      .match-list,
      .provider-list {
        display: grid;
        gap: 16px;
      }
      .match-card,
      .provider-card,
      .player-card {
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 20px;
        padding: 20px;
        text-decoration: none;
        color: inherit;
        display: block;
      }
      .eyebrow {
        color: #8ce4d8;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .meta {
        color: #9fb2c7;
        font-size: 14px;
      }
      .stream-grid {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: 20px;
      }
      iframe,
      video {
        width: 100%;
        min-height: 420px;
        border: 0;
        border-radius: 18px;
        background: #000;
      }
      .cta {
        display: inline-block;
        margin-top: 12px;
        color: #8ce4d8;
      }
      code {
        background: rgba(148, 163, 184, 0.15);
        border-radius: 8px;
        padding: 2px 6px;
      }
      @media (max-width: 900px) {
        .stream-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="page-shell">
      ${body}
    </div>
  </body>
</html>`;
}

function renderHomePage() {
  const cards = Object.entries(matchPages)
    .map(
      ([matchId, match]) => `<a
        class="match-card"
        href="/demo-source/match/${matchId}"
        data-event-id="${matchId}"
        data-title="${match.title}"
        data-match-title="${match.title}"
        data-sport-id="${match.sportId}"
        data-sport-name="${match.sportId.charAt(0).toUpperCase()}${match.sportId.slice(1)}"
        data-league="${match.league}"
        data-round="${match.round}"
        data-venue="${match.venue}"
        data-status="${match.status}"
        data-kickoff="${match.kickoffLabel}"
        data-minute="${match.minuteLabel || ''}"
        data-score="${match.scoreLine}"
        data-home-team="${match.homeTeam}"
        data-away-team="${match.awayTeam}"
        data-summary="Local demo catalog entry. Streams are resolved from the demo site flow at runtime."
        data-stream-count="${match.providers.length}"
      >
        <div class="eyebrow">${match.league}</div>
        <h2>${match.title}</h2>
        <p class="meta">${match.venue}</p>
      </a>`
    )
    .join('');

  return pageTemplate(
    'Pulse Arena Demo Source',
    `<p class="eyebrow">Demo Source</p>
     <h1>Home Page</h1>
     <p class="meta">This local page simulates a source site home page with match links.</p>
     <div class="match-list">${cards}</div>`
  );
}

function renderMatchPage(matchId) {
  const match = matchPages[matchId];
  if (!match) {
    return null;
  }

  const providerCards = match.providers
    .map(
      (provider) => `<a class="provider-card" href="/demo-source/provider/${matchId}/${provider.slug}">
        <div class="eyebrow">${provider.quality} • ${provider.language}</div>
        <h3>${provider.label}</h3>
        <p class="meta">Select this provider page to continue to playback.</p>
      </a>`
    )
    .join('');

  return pageTemplate(
    `${match.title} Providers`,
    `<p class="eyebrow">${match.league}</p>
     <h1>${match.title}</h1>
     <p class="meta">${match.venue}</p>
     <div id="streams" class="provider-list">${providerCards}</div>`
  );
}

function renderProviderPage(matchId, providerSlug) {
  const match = matchPages[matchId];
  if (!match) {
    return null;
  }

  const provider = match.providers.find((entry) => entry.slug === providerSlug);
  if (!provider) {
    return null;
  }

  let body = `<p class="eyebrow">${match.title}</p>
    <h1>${provider.label}</h1>
    <p class="meta">This local page simulates the provider page that the resolver opens after the match page.</p>`;

  switch (providerSlug) {
    case 'world-feed':
    case 'stadium-feed':
    case 'national-feed':
      body += `<div class="player-card">
        <p class="meta">Direct media link exposed on the provider page.</p>
        <a class="cta" href="${DEMO_HLS_MAIN}">Primary HLS Stream</a>
      </div>`;
      break;
    case 'hindi-feed':
    case 'backboard-cam':
      body += `<div class="player-card">
        <p class="meta">Alternate direct media link exposed on the provider page.</p>
        <source src="${DEMO_HLS_ALT}" type="application/vnd.apple.mpegurl" />
        <a class="cta" href="${DEMO_HLS_ALT}">Alternate HLS Stream</a>
      </div>`;
      break;
    case 'studio-embed':
      body += `<div class="player-card">
        <p class="meta">Embedded player page link exposed on the provider page.</p>
        <iframe
          src="/demo-source/embed/${matchId}/${providerSlug}"
          title="${provider.label}"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>`;
      break;
    default:
      body += `<div class="player-card">
        <p class="meta">Fallback provider page.</p>
      </div>`;
  }

  return pageTemplate(`${provider.label} Provider`, body);
}

function renderEmbedPage(matchId, embedSlug) {
  const match = matchPages[matchId];
  if (!match) {
    return null;
  }

  const title = `${match.title} Embedded Player`;
  return pageTemplate(
    title,
    `<p class="eyebrow">Embedded Player</p>
     <h1>${title}</h1>
     <p class="meta">This local page simulates the final playable page. The resolver can return this page as <code>kind: "embed"</code>.</p>
     <div class="stream-grid">
       <div class="player-card">
         <iframe
           src="https://www.youtube.com/embed/jfKfPfyJRdk"
           title="${title}"
           allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
           allowfullscreen
         ></iframe>
       </div>
       <div class="player-card">
         <p class="meta">Embed slug</p>
         <h2>${embedSlug}</h2>
         <p class="meta">You can replace this page with your real embed markup later.</p>
       </div>
     </div>`
  );
}

export const demoSourceCatalog = {
  sports: [
    { id: 'all', name: 'All Sports', accent: '#2dd4bf', shortLabel: 'ALL' },
    { id: 'football', name: 'Football', accent: '#22c55e', shortLabel: 'FTB' },
    { id: 'cricket', name: 'Cricket', accent: '#f59e0b', shortLabel: 'CRK' },
    { id: 'basketball', name: 'Basketball', accent: '#38bdf8', shortLabel: 'BSK' },
  ],
  matches: Object.entries(matchPages).map(([id, match]) => ({
    id,
    sportId: match.sportId,
    league: match.league,
    round: match.round,
    title: match.title,
    summary: 'Local demo catalog entry. Streams are resolved from the demo site flow at runtime.',
    venue: match.venue,
    status: match.status,
    kickoffLabel: match.kickoffLabel,
    minuteLabel: match.minuteLabel,
    scoreLine: match.scoreLine,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    tags: match.tags,
    streamCountHint: match.providers.length,
    resolverQuery: {
      eventId: id,
      title: match.title,
      search: match.title,
    },
  })),
};

export function getDemoSourceResponse(pathname) {
  if (pathname === '/demo-source' || pathname === '/demo-source/home') {
    return {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: renderHomePage(),
    };
  }

  const matchPageMatch = pathname.match(/^\/demo-source\/match\/([^/]+)$/);
  if (matchPageMatch) {
    const body = renderMatchPage(decodeURIComponent(matchPageMatch[1]));
    if (!body) {
      return null;
    }

    return {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    };
  }

  const providerPageMatch = pathname.match(/^\/demo-source\/provider\/([^/]+)\/([^/]+)$/);
  if (providerPageMatch) {
    const body = renderProviderPage(
      decodeURIComponent(providerPageMatch[1]),
      decodeURIComponent(providerPageMatch[2])
    );
    if (!body) {
      return null;
    }

    return {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    };
  }

  const embedPageMatch = pathname.match(/^\/demo-source\/embed\/([^/]+)\/([^/]+)$/);
  if (embedPageMatch) {
    const body = renderEmbedPage(
      decodeURIComponent(embedPageMatch[1]),
      decodeURIComponent(embedPageMatch[2])
    );
    if (!body) {
      return null;
    }

    return {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    };
  }

  return null;
}
