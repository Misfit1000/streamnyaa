import { describe, expect, it } from 'vitest';
import {
  isLocalPlaybackFailure,
  isSourceSpecificFailure,
} from '../../src/pages/DesktopWatch';

describe('desktop source-health memory', () => {
  it('never blames a release for local engine, cache-reuse, or switch races', () => {
    const messages = [
      'Local engine: file selection failed: HTTP 500. Cache access denied.',
      'Local engine: selected video returned HTTP 500.',
      'Could not add source to local stream engine: HTTP 400 Bad Request. error creating a new file because allow_overwrite = false. The file exists. (os error 80)',
      'Local stream request failed: error sending request for url (http://127.0.0.1:3030/torrents/0)',
      'Playback source switch was superseded by a newer source.',
      'The native player could not complete the player handoff.',
    ];

    for (const message of messages) {
      expect(isLocalPlaybackFailure(message)).toBe(true);
      expect(isSourceSpecificFailure(message)).toBe(false);
    }
  });

  it('retains genuine release-specific failures for bounded failover decisions', () => {
    expect(isSourceSpecificFailure('No peers responded for this release.')).toBe(true);
    expect(isSourceSpecificFailure('No matching playable video file was found.')).toBe(true);
    expect(isSourceSpecificFailure('Midstream buffer stopped advancing.')).toBe(true);
    expect(isSourceSpecificFailure('Unsupported codec: AV1 decoder error.')).toBe(true);
  });
});
