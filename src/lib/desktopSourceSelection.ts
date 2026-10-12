/** Display confidence never establishes anime/episode identity. */
export type SourceMode = 'strict' | 'balanced' | 'broad';
export function sourceAudioCompatible(title: string, audio: 'sub' | 'dub' | 'any') {
  if (audio === 'any') return true;
  const dual = /\b(?:dual[ .-]?audio|multi[ .-]?audio)\b/i.test(title);
  const dub = /\b(?:dub(?:bed)?|english[ .-]?audio|eng[ .-]?dub)\b/i.test(title);
  return audio === 'dub' ? dual || dub : dual || !dub;
}
export function selectSourceMode<T extends { title: string; matchTier: string; playable: boolean; manualOnly?: boolean }>(
  sources: T[], mode: SourceMode, audio: 'sub' | 'dub' | 'any',
  score: (source: T) => number, failed: (source: T) => boolean,
) {
  return sources.filter(source => {
    if (source.matchTier === 'rejected' || !sourceAudioCompatible(source.title, audio)) return false;
    if (mode === 'broad') return true;
    if (source.manualOnly || !source.playable || source.matchTier !== 'exact' || failed(source)) return false;
    return score(source) >= (mode === 'strict' ? 72 : 42);
  });
}
