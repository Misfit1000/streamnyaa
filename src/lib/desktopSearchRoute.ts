/** Share search state with Explore without discarding the user's filters. */
export function desktopSearchPath(query: string, pathname: string, search: string) {
  const params = new URLSearchParams(pathname === '/search' ? search : '');
  const value = query.trim();
  if (value) params.set('q', value); else params.delete('q');
  return `/search${params.size ? `?${params}` : ''}`;
}
