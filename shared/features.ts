export type ProductFeatureId =
  | 'home'
  | 'explore'
  | 'schedule'
  | 'catalog'
  | 'anime'
  | 'manga'
  | 'watch'
  | 'downloads'
  | 'sources'
  | 'library'
  | 'compare'
  | 'history'
  | 'settings'
  | 'profile'
  | 'auth';

export type ProductFeature = {
  id: ProductFeatureId;
  label: string;
  desktopPaths: readonly string[];
  mobileRoute: string;
  requiresAccount?: boolean;
};

/**
 * Cross-platform product contract. A feature is not considered ported until it
 * has both a desktop path and an Android route represented here.
 */
export const PRODUCT_FEATURES = [
  { id: 'home', label: 'Home', desktopPaths: ['/'], mobileRoute: 'Home' },
  { id: 'explore', label: 'Explore', desktopPaths: ['/search'], mobileRoute: 'Explore' },
  { id: 'schedule', label: 'Schedule', desktopPaths: ['/schedule'], mobileRoute: 'Schedule' },
  { id: 'catalog', label: 'Catalog', desktopPaths: ['/anime/popular', '/anime/genre/:genre', '/anime/season/:seasonSlug', '/season/:seasonSlug'], mobileRoute: 'Catalog' },
  { id: 'anime', label: 'Anime details', desktopPaths: ['/anime/:id'], mobileRoute: 'Anime' },
  { id: 'manga', label: 'Manga details', desktopPaths: ['/manga/:id'], mobileRoute: 'Manga' },
  { id: 'watch', label: 'Watch', desktopPaths: ['/watch/:id'], mobileRoute: 'Watch' },
  { id: 'downloads', label: 'Release browser', desktopPaths: ['/anime/:id/downloads'], mobileRoute: 'Downloads' },
  { id: 'sources', label: 'Source search', desktopPaths: ['/nyaa'], mobileRoute: 'Sources' },
  { id: 'library', label: 'Library', desktopPaths: ['/my-list'], mobileRoute: 'Library', requiresAccount: true },
  { id: 'compare', label: 'Compare', desktopPaths: ['/compare'], mobileRoute: 'Compare' },
  { id: 'history', label: 'History', desktopPaths: ['/dashboard'], mobileRoute: 'History' },
  { id: 'settings', label: 'Settings', desktopPaths: ['/desktop-settings'], mobileRoute: 'Settings' },
  { id: 'profile', label: 'Profile', desktopPaths: ['/profile'], mobileRoute: 'Profile', requiresAccount: true },
  { id: 'auth', label: 'Account', desktopPaths: ['/login', '/reset-password'], mobileRoute: 'SignIn' },
] as const satisfies readonly ProductFeature[];

export function productFeature(id: ProductFeatureId) {
  return PRODUCT_FEATURES.find((feature) => feature.id === id);
}
