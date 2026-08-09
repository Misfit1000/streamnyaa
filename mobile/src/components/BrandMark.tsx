import { Image, type ImageStyle, type StyleProp } from 'react-native';

export const streamNyaaLogo = require('../../assets/brand/streamnyaa-logo.png');

export function BrandMark({ size = 40, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={streamNyaaLogo}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityLabel="StreamNyaa"
      style={[{ width: size, height: size }, style]}
    />
  );
}
