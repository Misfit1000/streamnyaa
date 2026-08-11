import { describe, expect, it } from 'vitest';
import { equivalentTrack, preferredTrackIndexes } from './trackSelection';

const audio = [
  { id: 'ja', language: 'jpn', label: 'Japanese' },
  { id: 'en', language: 'eng', label: 'English' },
];
const subtitles = [
  { id: 'signs', language: 'eng', label: 'English Signs' },
  { id: 'dialogue', language: 'eng', label: 'English Dialogue' },
];

describe('preferredTrackIndexes', () => {
  it('enables an English subtitle for subtitled playback', () => {
    expect(preferredTrackIndexes(audio.slice(0, 1), subtitles, 'sub-preferred')).toEqual({ audioIndex: 0, subtitleIndex: 1 });
  });

  it('prefers English audio without redundant subtitles for dual audio', () => {
    expect(preferredTrackIndexes(audio, subtitles, 'dual-preferred')).toEqual({ audioIndex: 1, subtitleIndex: -1 });
  });

  it('falls back to Japanese audio and subtitles when a dub is unavailable', () => {
    expect(preferredTrackIndexes(audio.slice(0, 1), subtitles, 'dual-preferred')).toEqual({ audioIndex: 0, subtitleIndex: 1 });
  });

  it('restores a manually chosen track after a local stream reconnect', () => {
    expect(equivalentTrack([{ id: 'dialogue', language: 'eng' }], { id: 'dialogue' })?.id).toBe('dialogue');
  });
});
