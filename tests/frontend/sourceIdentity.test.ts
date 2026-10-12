import { describe, expect, it } from 'vitest';
import { buildSourceIdentity, classifySourceIdentity, parseSourceEpisode, sourceEpisodeIdentity, sourceIdentitySignature } from '../../src/lib/desktopSourceIdentity';
import fixtures from '../fixtures/source-identity.json';

function sequel(format = 'ONA') { return buildSourceIdentity({ mal_id: 2, type: format, title: 'Yasei no Last Boss ga Arawareta! Season 2', title_romaji: 'Yasei no Last Boss ga Arawareta!' }); }
describe('canonical source identity', () => {
  it.each(fixtures.cases)('agrees with native golden fixture: $title', fixture => {
    expect(classifySourceIdentity(fixture.title, fixture.identity || fixtures.identity, fixture.episode).evidence).toBe(fixture.evidence);
  });
  it.each(['TV', 'ONA', 'OVA', 'SPECIAL'])('never promotes a bare old-season title for a %s sequel', format => {
    const identity = sequel(format);
    expect(classifySourceIdentity('[Erai-raws] Yasei no Last Boss ga Arawareta! - 01 [1080p]', identity, 1).evidence).toBe('uncertain');
    expect(classifySourceIdentity('Yasei no Last Boss ga Arawareta! S01E01', identity, 1).evidence).toBe('conflict');
    expect(classifySourceIdentity('Yasei no Last Boss ga Arawareta! S02E01', identity, 1).evidence).toBe('exact');
    expect(classifySourceIdentity('Yasei no Last Boss ga Arawareta! Season 2 - 01 [1080p]', identity, 1).evidence).toBe('exact');
  });
  it.each([['Example S02E01', 1], ['Example S01E03', 3], ['Example S02E105', 105], ['Example EP01', 1], ['Example - 003v2 [1080p]', 3], ['Example Season 2', null], ['86', null]])('parses episode intent in %s', (query, episode) => {
    expect(parseSourceEpisode(String(query))).toBe(episode);
  });
  it('requires correct part evidence even when the season alias matches', () => {
    const identity = buildSourceIdentity({ mal_id: 7, title: 'Example Season 2 Part 2', title_english: 'Example Season 2' });
    expect(classifySourceIdentity('Example Season 2 Part 1 - 01', identity, 1).evidence).toBe('conflict');
    expect(classifySourceIdentity('Example Season 2 - 01', identity, 1).evidence).toBe('uncertain');
    expect(classifySourceIdentity('Example Season 2 Part 2 - 01', identity, 1).evidence).toBe('exact');
  });
  it('rejects overlapping franchise words and conflicting episodes', () => {
    const identity = buildSourceIdentity({ mal_id: 1, title: 'Hunter x Hunter' });
    expect(classifySourceIdentity('Vampire Hunter D - 01', identity, 1).evidence).toBe('conflict');
    expect(classifySourceIdentity('Hunter x Hunter - 02', identity, 1).evidence).toBe('conflict');
  });
  it('changes ranked cache identity when canonical sequel evidence arrives', () => {
    const first = buildSourceIdentity({ mal_id: 2, title: 'Example' });
    const hydrated = buildSourceIdentity({ mal_id: 2, title: 'Example Season 2' });
    expect(sourceIdentitySignature(first)).not.toBe(sourceIdentitySignature(hydrated));
    expect(classifySourceIdentity('Example - 01', hydrated, 1).evidence).not.toBe('exact');
  });
  it('does not relabel manual sources using the requested episode', () => {
    expect(sourceEpisodeIdentity('Example - 02 [1080p]', 1)).toEqual({ episode: 2, conflict: true, needsReview: false });
    expect(sourceEpisodeIdentity('Example Season 2', 2)).toEqual({ episode: null, conflict: false, needsReview: true });
    expect(sourceEpisodeIdentity('Example S02E01', '1')).toEqual({ episode: 1, conflict: false, needsReview: false });
  });
  it('accepts a verified installment-specific subtitle without requiring a release season tag', () => {
    const identity = buildSourceIdentity({ mal_id: 3, title: 'Example: After Story', relations: [{ relation: 'Prequel', entry: [{ name: 'Example' }] }] });
    expect(identity.sequel).toBe(true);
    expect(classifySourceIdentity('Example After Story - 01', identity, 1).evidence).toBe('exact');
    expect(classifySourceIdentity('Example - 01', identity, 1).evidence).toBe('conflict');
  });
});
