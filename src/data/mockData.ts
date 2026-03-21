import type { SportsCatalog } from '../types';

const demoHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const demoAltHls = 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8';

export const mockCatalog: SportsCatalog = {
  sports: [
    { id: 'all', name: 'All Sports', accent: '#2dd4bf', shortLabel: 'ALL' },
    { id: 'football', name: 'Football', accent: '#22c55e', shortLabel: 'FTB' },
    { id: 'cricket', name: 'Cricket', accent: '#f59e0b', shortLabel: 'CRK' },
    { id: 'mma', name: 'MMA', accent: '#ef4444', shortLabel: 'MMA' },
    { id: 'basketball', name: 'Basketball', accent: '#38bdf8', shortLabel: 'BSK' },
    { id: 'motorsport', name: 'Motorsport', accent: '#fb7185', shortLabel: 'MTR' }
  ],
  matches: [
    {
      id: 'ucl-1',
      sportId: 'football',
      league: 'UEFA Champions Night',
      round: 'Quarterfinal',
      title: 'Arclight FC vs Northshore',
      summary: 'High press against compact defending. Two authorized world-feed options are active.',
      venue: 'Cobalt Arena',
      status: 'live',
      kickoffLabel: 'Started 19:00',
      minuteLabel: "67'",
      scoreLine: '2 - 1',
      homeTeam: 'Arclight FC',
      awayTeam: 'Northshore',
      tags: ['HDR', 'World Feed', 'English'],
      streams: [
        {
          id: 'ucl-1-main',
          label: 'World Feed',
          provider: 'SportsHub CDN',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: demoHls,
          authorized: true,
          notes: 'Primary rights-cleared match feed.'
        },
        {
          id: 'ucl-1-alt',
          label: 'Tactical Cam',
          provider: 'SportsHub CDN',
          quality: '720p',
          language: 'English',
          kind: 'hls',
          url: demoAltHls,
          authorized: true,
          notes: 'Alternative tactical angle for second-screen viewing.'
        }
      ]
    },
    {
      id: 'ipl-1',
      sportId: 'cricket',
      league: 'Premier Twenty',
      round: 'League Stage',
      title: 'Kingsport vs Harbor XI',
      summary: 'Chasing side needs 34 from 18. Clean rights-managed HLS ladder ready.',
      venue: 'Lotus Stadium',
      status: 'live',
      kickoffLabel: 'Started 15:30',
      minuteLabel: '18.2 ov',
      scoreLine: '184 / 6',
      homeTeam: 'Kingsport',
      awayTeam: 'Harbor XI',
      tags: ['4K Ready', 'Hindi', 'English'],
      streams: [
        {
          id: 'ipl-1-main',
          label: 'Stadium Feed',
          provider: 'Nimbus Broadcast',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: demoAltHls,
          authorized: true,
          notes: 'Primary live stadium program feed.'
        },
        {
          id: 'ipl-1-hindi',
          label: 'Hindi Commentary',
          provider: 'Nimbus Broadcast',
          quality: '720p',
          language: 'Hindi',
          kind: 'hls',
          url: demoHls,
          authorized: true,
          notes: 'Localized commentary track carried as separate stream.'
        }
      ]
    },
    {
      id: 'nba-1',
      sportId: 'basketball',
      league: 'Metro Elite League',
      round: 'Game 4',
      title: 'Metro Blaze vs Coastline',
      summary: 'A pace-heavy matchup with three synchronized authorized feeds.',
      venue: 'Summit Pavilion',
      status: 'live',
      kickoffLabel: 'Started 21:00',
      minuteLabel: 'Q4 04:12',
      scoreLine: '104 - 101',
      homeTeam: 'Metro Blaze',
      awayTeam: 'Coastline',
      tags: ['Court Cam', '1080p60', 'English'],
      streams: [
        {
          id: 'nba-1-main',
          label: 'National Feed',
          provider: 'Pulse Sports',
          quality: '1080p60',
          language: 'English',
          kind: 'hls',
          url: demoHls,
          authorized: true,
          notes: 'High frame-rate primary feed.'
        },
        {
          id: 'nba-1-backboard',
          label: 'Backboard Cam',
          provider: 'Pulse Sports',
          quality: '720p',
          language: 'Natural Sound',
          kind: 'hls',
          url: demoAltHls,
          authorized: true
        }
      ]
    },
    {
      id: 'mma-1',
      sportId: 'mma',
      league: 'Cage Night',
      round: 'Main Event',
      title: 'Ryder Cole vs Niko Vale',
      summary: 'Live card with one clean main feed and one backstage preview lane.',
      venue: 'Forge Center',
      status: 'upcoming',
      kickoffLabel: 'Starts in 22 min',
      scoreLine: '0 - 0',
      homeTeam: 'Ryder Cole',
      awayTeam: 'Niko Vale',
      tags: ['PPV', 'Authorized', 'English'],
      streams: [
        {
          id: 'mma-1-main',
          label: 'Fight Night Main',
          provider: 'FightGrid',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: demoAltHls,
          authorized: true,
          notes: 'Opens at event start.'
        }
      ]
    },
    {
      id: 'f1-1',
      sportId: 'motorsport',
      league: 'Grand Prix Weekend',
      round: 'Qualifying',
      title: 'Desert Circuit Qualifying',
      summary: 'Timing-heavy session with main program lane and driver tracker lane.',
      venue: 'Desert Circuit',
      status: 'live',
      kickoffLabel: 'Started 16:00',
      minuteLabel: 'Q3 06:14',
      scoreLine: 'Pole Shootout',
      homeTeam: 'Session',
      awayTeam: 'Qualifying',
      tags: ['Telemetry', '1080p', 'English'],
      streams: [
        {
          id: 'f1-1-main',
          label: 'Program Feed',
          provider: 'TrackVision',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: demoHls,
          authorized: true
        },
        {
          id: 'f1-1-multicam',
          label: 'Onboard Mix',
          provider: 'TrackVision',
          quality: '720p',
          language: 'Natural Sound',
          kind: 'hls',
          url: demoAltHls,
          authorized: true
        }
      ]
    },
    {
      id: 'seriea-2',
      sportId: 'football',
      league: 'Sunday Spotlight',
      round: 'Matchday 31',
      title: 'Port Verde vs Union City',
      summary: 'Lower-third graphics optimized for TV. Feed window opens 5 minutes pre-kick.',
      venue: 'Bayline Ground',
      status: 'upcoming',
      kickoffLabel: 'Starts in 48 min',
      scoreLine: '0 - 0',
      homeTeam: 'Port Verde',
      awayTeam: 'Union City',
      tags: ['Pre-match', 'Spanish', 'English'],
      streams: [
        {
          id: 'seriea-2-main',
          label: 'International Feed',
          provider: 'GoalWire',
          quality: '1080p',
          language: 'English',
          kind: 'hls',
          url: demoHls,
          authorized: true
        }
      ]
    }
  ]
};
