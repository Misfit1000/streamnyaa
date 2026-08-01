import Constants from 'expo-constants';

const configuredOrigin = String(Constants.expoConfig?.extra?.apiOrigin || '').replace(/\/+$/, '');

export const API_ORIGIN = configuredOrigin || 'https://www.streamnyaa.xyz';
export const ANILIST_URL = 'https://graphql.anilist.co';
export const JIKAN_URL = 'https://api.jikan.moe/v4';
export const APP_SCHEME = 'streamnyaa';
export const SOURCE_CATEGORY = '1_2';
export const SOURCE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
];
