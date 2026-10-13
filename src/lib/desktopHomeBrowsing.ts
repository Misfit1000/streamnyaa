import { useEffect, useState } from 'react';
import { chooseReadyEpisode } from './desktopHomeReadiness';

export const HOME_CHINESE_ANIMATION_KEY = 'streamnyaa.desktop.homeShowChineseAnimation.v1';
export const HOME_BROWSING_EVENT = 'streamnyaa:home-browsing-preference';

/** Country metadata only: ONA, Chinese characters, names and audio are not origin evidence. */
export function isChineseAnimation(anime: any) {
  const country = String(anime?.countryOfOrigin ?? anime?.country_of_origin ?? '').trim().toUpperCase();
  return ['CN', 'CHN', 'CHINA'].includes(country);
}
export function homeBrowseVisible(anime: any, showChineseAnimation: boolean) {
  return showChineseAnimation || !isChineseAnimation(anime);
}
export function homeBrowseItems(items: any[], showChineseAnimation: boolean, episodesFor: (anime: any) => number[], preferred: (anime: any) => number, recent = false) {
  return items.filter(anime => homeBrowseVisible(anime, showChineseAnimation)).map(anime => {
    const episodes = episodesFor(anime);
    const requested = recent ? Number(anime.listedEpisode || anime.latestEpisode || 1) : preferred(anime);
    const episode = recent ? episodes.includes(requested) ? requested : undefined : chooseReadyEpisode(episodes, requested);
    return { ...anime, homeReadyEpisode: episode, homeAvailabilityLabel: episode ? `Episode ${episode} source found` : undefined };
  });
}
export function useHomeBrowsingPreference() {
  const read = () => { try { return localStorage.getItem(HOME_CHINESE_ANIMATION_KEY) === 'true'; } catch { return false; } };
  const [showChineseAnimation, setShow] = useState(read);
  useEffect(() => {
    const refresh = () => setShow(read());
    window.addEventListener(HOME_BROWSING_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(HOME_BROWSING_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return { showChineseAnimation, setShowChineseAnimation(value: boolean) {
    setShow(value);
    try { localStorage.setItem(HOME_CHINESE_ANIMATION_KEY, String(value)); window.dispatchEvent(new Event(HOME_BROWSING_EVENT)); } catch { /* Keep the current in-memory selection. */ }
  } };
}
