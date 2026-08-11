import type { SubtitleStylePreferences } from '../../../shared/preferences';

export const STREAMNYAA_SUBTITLE_DEFAULT: SubtitleStylePreferences = {
  fontSize: 'medium',
  position: 'normal',
  textColor: 'white',
  outline: 'medium',
  shadow: 'off',
  background: 'light',
  custom: false,
};

export type NativeSubtitleStyle = Omit<SubtitleStylePreferences, 'custom'> & {
  protocolVersion: 1;
  fontFamily: 'streamnyaa-semibold';
};

export function effectiveSubtitleStyle(style: SubtitleStylePreferences): SubtitleStylePreferences {
  return style.custom ? style : STREAMNYAA_SUBTITLE_DEFAULT;
}

export function nativeSubtitleStyle(style: SubtitleStylePreferences): NativeSubtitleStyle {
  const effective = effectiveSubtitleStyle(style);
  return {
    protocolVersion: 1,
    fontFamily: 'streamnyaa-semibold',
    fontSize: ['small', 'medium', 'large', 'extra_large'].includes(effective.fontSize) ? effective.fontSize : 'medium',
    position: ['low', 'normal', 'high'].includes(effective.position) ? effective.position : 'normal',
    textColor: ['white', 'yellow', 'red', 'cyan'].includes(effective.textColor) ? effective.textColor : 'white',
    outline: ['none', 'thin', 'medium', 'thick'].includes(effective.outline) ? effective.outline : 'medium',
    shadow: ['off', 'soft', 'strong'].includes(effective.shadow) ? effective.shadow : 'off',
    background: ['off', 'light', 'dark'].includes(effective.background) ? effective.background : 'light',
  };
}
