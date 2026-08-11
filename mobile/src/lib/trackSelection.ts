import type { AudioPreference } from '../../../shared/preferences';

export type MediaTrackLike = {
  id?: string | null;
  language?: string | null;
  label?: string | null;
  name?: string | null;
};

function trackText(track: MediaTrackLike) {
  return [track.language, track.label, track.name].filter(Boolean).join(' ').toLocaleLowerCase();
}

function languageIndex(tracks: MediaTrackLike[], pattern: RegExp) {
  return tracks.findIndex((track) => pattern.test(trackText(track)));
}

function englishIndex(tracks: MediaTrackLike[]) {
  return languageIndex(tracks, /(?:^|\W)(?:en|eng|english)(?:\W|$)/i);
}

function englishDialogueSubtitleIndex(tracks: MediaTrackLike[]) {
  const dialogue = tracks.findIndex((track) => {
    const value = trackText(track);
    return /(?:^|\W)(?:en|eng|english)(?:\W|$)/i.test(value)
      && !/\b(?:signs?|songs?|forced|sdh)\b/i.test(value);
  });
  return dialogue >= 0 ? dialogue : englishIndex(tracks);
}

function japaneseIndex(tracks: MediaTrackLike[]) {
  return languageIndex(tracks, /(?:^|\W)(?:ja|jpn|jp|japanese)(?:\W|$)/i);
}

export function preferredTrackIndexes(
  audioTracks: MediaTrackLike[],
  subtitleTracks: MediaTrackLike[],
  preference: AudioPreference,
) {
  const englishAudio = englishIndex(audioTracks);
  const japaneseAudio = japaneseIndex(audioTracks);
  const englishSubtitle = englishDialogueSubtitleIndex(subtitleTracks);
  const fallbackSubtitle = subtitleTracks.length ? 0 : -1;

  if (preference === 'dub-only') {
    return { audioIndex: englishAudio, subtitleIndex: -1 };
  }
  if (preference === 'dual-preferred' && englishAudio >= 0) {
    return { audioIndex: englishAudio, subtitleIndex: -1 };
  }
  return {
    audioIndex: japaneseAudio,
    subtitleIndex: englishSubtitle >= 0 ? englishSubtitle : fallbackSubtitle,
  };
}

export function equivalentTrack<T extends MediaTrackLike>(tracks: T[], requested: MediaTrackLike) {
  if (requested.id) {
    const byId = tracks.find((track) => track.id === requested.id);
    if (byId) return byId;
  }
  const requestedText = trackText(requested);
  return tracks.find((track) => trackText(track) === requestedText);
}
