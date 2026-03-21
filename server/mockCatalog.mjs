export const mockCatalog = {
  sports: [
    { id: 'all', name: 'All Sports', accent: '#2dd4bf', shortLabel: 'ALL' },
    { id: 'football', name: 'Football', accent: '#22c55e', shortLabel: 'FTB' },
    { id: 'cricket', name: 'Cricket', accent: '#f59e0b', shortLabel: 'CRK' },
    { id: 'mma', name: 'MMA', accent: '#ef4444', shortLabel: 'MMA' },
  ],
  matches: [
    {
      id: 'demo-1',
      sportId: 'football',
      league: 'Authorized Demo League',
      round: 'Matchday 1',
      title: 'Redbridge vs Westhaven',
      summary: 'Mock event returned by the local API server while no upstream feed endpoint is configured.',
      venue: 'Northlight Stadium',
      status: 'live',
      kickoffLabel: 'Started 19:00',
      minuteLabel: "54'",
      scoreLine: '1 - 0',
      homeTeam: 'Redbridge',
      awayTeam: 'Westhaven',
      tags: ['Authorized', 'Demo'],
      streams: [
        {
          id: 'demo-1-main',
          label: 'World Feed',
          provider: 'Pulse Arena Local API',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          authorized: true,
          notes: 'Replace this with your production signed stream URL.'
        }
      ]
    }
  ]
};
