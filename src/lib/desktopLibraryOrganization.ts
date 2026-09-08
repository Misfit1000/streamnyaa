export const libraryStatuses = ['Plan to watch', 'Watching', 'Completed', 'On hold', 'Dropped'] as const;
export type LibraryStatus = typeof libraryStatuses[number];
export interface LibraryOrganizationEntry { status: LibraryStatus; collections: string[]; revision: string }
export interface LibraryOrganization { entries: Record<string, LibraryOrganizationEntry>; collections: string[] }
export interface LibraryUndo { before: Record<string, LibraryOrganizationEntry | undefined>; revision: string }
const key = 'streamnyaa.desktop.libraryOrganization.v1';
export const libraryOrganizationEvent = 'streamnyaa-library-organization';
export function organizationIdentity(anime: any) {
  if (Number(anime?.mal_id) > 0) return `mal:${anime.mal_id}`;
  if (Number(anime?.anilist_id) > 0) return `anilist:${anime.anilist_id}`;
  return `title:${String(anime?.title || '').trim().toLowerCase()}`;
}
export function readLibraryOrganization(): LibraryOrganization {
  const empty = { entries: Object.create(null), collections: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    const collections = Array.isArray(raw.collections) ? [...new Set<string>(raw.collections.filter((name: unknown) => typeof name === 'string' && name.trim() && name.length <= 40))].slice(0, 30) : [];
    const entries: Record<string, LibraryOrganizationEntry> = Object.create(null);
    for (const [id, value] of Object.entries(raw.entries || {}).slice(0, 10000)) {
      const entry = value as LibraryOrganizationEntry;
      if (!/^(mal|anilist|title):/.test(id) || id.length > 300 || !libraryStatuses.includes(entry?.status) || !Array.isArray(entry.collections) || typeof entry.revision !== 'string') continue;
      entries[id] = { status: entry.status, collections: entry.collections.filter((name) => collections.includes(name)), revision: entry.revision };
    }
    return { entries, collections };
  } catch { return empty; }
}
function write(value: LibraryOrganization) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(libraryOrganizationEvent));
  return value;
}
export function createLibraryCollection(name: string) {
  const value = readLibraryOrganization();
  name = name.trim().slice(0, 40);
  if (!name) throw new Error('Enter a collection name.');
  if (!value.collections.includes(name)) {
    if (value.collections.length >= 30) throw new Error('A maximum of 30 collections is supported.');
    value.collections.push(name);
  }
  return write(value);
}
export function updateLibraryOrganization(ids: string[], change: { status?: LibraryStatus; collection?: string }): LibraryUndo {
  const value = readLibraryOrganization();
  if (change.status && !libraryStatuses.includes(change.status)) throw new Error('Invalid library status.');
  if (change.collection && !value.collections.includes(change.collection)) throw new Error('Collection no longer exists.');
  const revision = crypto.randomUUID();
  const before: LibraryUndo['before'] = Object.create(null);
  for (const id of new Set(ids)) {
    if (!/^(mal|anilist|title):/.test(id) || id.length > 300) continue;
    before[id] = value.entries[id];
    const previous = value.entries[id];
    value.entries[id] = { status: change.status || previous?.status || 'Plan to watch', collections: [...new Set([...(previous?.collections || []), ...(change.collection ? [change.collection] : [])])], revision };
  }
  write(value);
  return { before, revision };
}
export function undoLibraryOrganization(undo: LibraryUndo) {
  const value = readLibraryOrganization();
  for (const [id, previous] of Object.entries(undo.before)) {
    if (value.entries[id]?.revision !== undo.revision) continue; // Never undo a newer edit.
    if (previous) value.entries[id] = previous;
    else delete value.entries[id];
  }
  return write(value);
}
