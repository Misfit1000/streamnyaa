import { fetchAniList, fetchJikanPath } from './jikan';
import { desktopDataError, isDesktopAdmissionWait } from '../lib/desktopData';
import type { DesktopRequestOptions } from '../lib/desktopRequests';
import { episodeImageUrl } from '../lib/desktopEpisodeArtwork';

export type CastIdentity = { anilistId?: string | number | null; malId?: string | number | null };
export type CastCharacter = { id: string; name: string; image?: string; role: string;
  actors: { id: string; name: string; language: string }[] };
export type CastPage = { data: CastCharacter[]; provider: 'anilist' | 'tenrai'; page: number; hasNextPage: boolean; fetchedAt: number; stale: boolean; retryAt?: number };
const validId = (value: unknown) => /^[1-9]\d*$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
export const castIdentityKey = (identity: CastIdentity) => `${validId(identity.anilistId) ? `anilist:${identity.anilistId}` : ''}|${validId(identity.malId) ? `mal:${identity.malId}` : ''}`;
const state = (response: Response) => ({ fetchedAt: Number(response.headers.get('X-StreamNyaa-Fetched-At')) || Date.now(),
  stale: response.headers.get('X-StreamNyaa-Local-Cache') === 'local-stale' || response.headers.get('X-StreamNyaa-Desktop-Cache') === 'stale',
  retryAt: Number(response.headers.get('X-StreamNyaa-Retry-At')) || undefined });
export async function fetchAnimeCast(identity: CastIdentity, page = 1, options: DesktopRequestOptions = {}, provider?: CastPage['provider']): Promise<CastPage> {
  const anilistId = validId(identity.anilistId), malId = validId(identity.malId);
  if ((!anilistId && !malId) || !Number.isSafeInteger(page) || page < 1) throw desktopDataError('cast', new Error('Invalid cast identity or page.'));
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (provider !== 'tenrai') {
    try {
      const query = `query($id: Int!, $page: Int!) { Media(${anilistId ? 'id' : 'idMal'}: $id, type: ANIME) {
        id idMal characters(page: $page, perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
          pageInfo { hasNextPage } edges { role node { id name { full } image { medium } }
            voiceActors { id name { full } languageV2 } }
        }
      } }`;
      const response = await fetchAniList({ query, variables: { id: anilistId || malId, page } }, 86400, options);
      if (!response.ok) throw desktopDataError('anilist', new Error('Cast could not be loaded.'), response.status);
      const json = await response.json(); const media = json?.data?.Media;
      if (!media || !Array.isArray(media.characters?.edges) || anilistId && Number(media.id) !== anilistId
        || malId && media.idMal && Number(media.idMal) !== malId) throw desktopDataError('anilist', new Error('Invalid cast identity or response.'));
      return { provider: 'anilist', page, hasNextPage: media.characters.pageInfo?.hasNextPage === true, ...state(response),
        data: media.characters.edges.filter((edge: any) => edge?.node?.id && edge.node.name?.full).map((edge: any) => ({
          id: `anilist:${edge.node.id}`, name: edge.node.name.full, image: episodeImageUrl(edge.node.image?.medium),
          role: String(edge.role || '').toLowerCase().replace(/^./, (letter: string) => letter.toUpperCase()),
          actors: (edge.voiceActors || []).filter((actor: any) => actor?.id && actor.name?.full).map((actor: any) => ({
            id: `anilist:${actor.id}`, name: actor.name.full, language: actor.languageV2 || 'Unspecified' })),
        })) };
    } catch (error) {
      const failure = desktopDataError('anilist', error);
      if (provider || page !== 1 || !malId || options.signal?.aborted || failure.code === 'cancelled' || failure.code === 'invalid' || isDesktopAdmissionWait(failure)) throw error;
    }
  }
  if (!malId || page !== 1) throw desktopDataError('tenrai', new Error('Invalid cast identity or page.'));
  const response = await fetchJikanPath(`/anime/${malId}/characters`, 86400, options);
  if (!response.ok) throw desktopDataError('tenrai', new Error('Cast could not be loaded.'), response.status);
  const json = await response.json();
  if (!Array.isArray(json?.data)) throw desktopDataError('tenrai', new Error('Invalid cast response.'));
  return { provider: 'tenrai', page, hasNextPage: false, ...state(response), data: json.data
    .filter((entry: any) => entry?.character?.mal_id && entry.character.name).map((entry: any) => ({
      id: `mal:${entry.character.mal_id}`, name: entry.character.name, role: entry.role || '',
      image: episodeImageUrl(entry.character.images?.webp?.image_url || entry.character.images?.jpg?.image_url),
      actors: (entry.voice_actors || []).filter((actor: any) => actor?.person?.mal_id && actor.person.name).map((actor: any) => ({
        id: `mal:${actor.person.mal_id}`, name: actor.person.name, language: actor.language || 'Unspecified' })),
    })) };
}
