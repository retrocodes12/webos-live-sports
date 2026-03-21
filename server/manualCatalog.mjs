export const manualCatalogSource = {
  sports: [
    { id: 'all', name: 'All Sports', accent: '#2dd4bf', shortLabel: 'ALL' },
    { id: 'football', name: 'Football', accent: '#22c55e', shortLabel: 'FTB' },
    { id: 'cricket', name: 'Cricket', accent: '#f59e0b', shortLabel: 'CRK' },
    { id: 'mma', name: 'MMA', accent: '#ef4444', shortLabel: 'MMA' },
    { id: 'basketball', name: 'Basketball', accent: '#38bdf8', shortLabel: 'BSK' },
  ],
  matches: [
    {
      id: 'manual-football-1',
      sportId: 'football',
      league: 'Curated Match Board',
      round: 'Showcase',
      title: 'Redbridge vs Westhaven',
      summary: 'Manual catalog entry. Streams are meant to be resolved separately from a plugin-like source.',
      venue: 'Northlight Stadium',
      status: 'live',
      kickoffLabel: 'Started 19:00',
      minuteLabel: "54'",
      scoreLine: '1 - 0',
      homeTeam: 'Redbridge',
      awayTeam: 'Westhaven',
      tags: ['Manual Catalog', 'On-demand Links'],
      streamCountHint: 2,
      resolverQuery: {
        eventId: 'manual-football-1',
        title: 'Redbridge vs Westhaven',
        search: 'Redbridge vs Westhaven live'
      },
      streams: [
        {
          id: 'manual-football-1-main',
          label: 'World Feed',
          provider: 'Pulse Arena Demo Resolver',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          authorized: true,
          notes: 'Demo fallback stream while no external resolver is configured.'
        },
        {
          id: 'manual-football-1-alt',
          label: 'Alt Cam',
          provider: 'Pulse Arena Demo Resolver',
          quality: '720p',
          language: 'English',
          kind: 'hls',
          url: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
          authorized: true
        }
      ]
    },
    {
      id: 'manual-cricket-1',
      sportId: 'cricket',
      league: 'Curated Match Board',
      round: 'Night Fixture',
      title: 'Kingsport vs Harbor XI',
      summary: 'This event shows how the app can own metadata while the resolver returns only links.',
      venue: 'Lotus Stadium',
      status: 'upcoming',
      kickoffLabel: 'Today 20:30',
      scoreLine: '0 - 0',
      homeTeam: 'Kingsport',
      awayTeam: 'Harbor XI',
      tags: ['Resolver Ready', 'Hindi', 'English'],
      streamCountHint: 2,
      resolverQuery: {
        eventId: 'manual-cricket-1',
        title: 'Kingsport vs Harbor XI',
        search: 'Kingsport Harbor XI stream'
      }
    },
    {
      id: 'manual-basketball-1',
      sportId: 'basketball',
      league: 'Curated Match Board',
      round: 'Prime Time',
      title: 'Metro Blaze vs Coastline',
      summary: 'Use match IDs or custom lookup metadata here to ask your backend for links.',
      venue: 'Summit Pavilion',
      status: 'live',
      kickoffLabel: 'Started 21:00',
      minuteLabel: 'Q4 03:40',
      scoreLine: '104 - 101',
      homeTeam: 'Metro Blaze',
      awayTeam: 'Coastline',
      tags: ['Manual Event', 'Resolver'],
      streamCountHint: 1,
      resolverQuery: {
        eventId: 'manual-basketball-1',
        title: 'Metro Blaze vs Coastline'
      }
    }
  ]
};
