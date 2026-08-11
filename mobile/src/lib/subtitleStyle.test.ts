import { describe, expect, it } from 'vitest';
import { STREAMNYAA_SUBTITLE_DEFAULT, effectiveSubtitleStyle, nativeSubtitleStyle } from './subtitleStyle';

describe('mobile subtitle styling', () => {
  it('uses the StreamNyaa player preset whenever custom styling is disabled', () => {
    expect(effectiveSubtitleStyle({
      fontSize: 'extra_large', position: 'high', textColor: 'yellow',
      outline: 'none', shadow: 'strong', background: 'dark', custom: false,
    })).toEqual(STREAMNYAA_SUBTITLE_DEFAULT);
  });

  it('preserves valid custom choices for the native Android subtitle renderer', () => {
    expect(nativeSubtitleStyle({
      fontSize: 'large', position: 'high', textColor: 'cyan',
      outline: 'thin', shadow: 'soft', background: 'off', custom: true,
    })).toMatchObject({
      protocolVersion: 1, fontFamily: 'streamnyaa-semibold', fontSize: 'large',
      position: 'high', textColor: 'cyan', outline: 'thin', shadow: 'soft', background: 'off',
    });
  });
});
