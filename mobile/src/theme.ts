import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const tokens = {
  color: {
    brand: '#E43D5C',
    brandSoft: '#43232C',
    background: '#121014',
    surface: '#1A171C',
    surfaceRaised: '#232026',
    outline: '#373139',
    text: '#F4EFF3',
    textMuted: '#B8AFB6',
    success: '#66D19E',
    warning: '#F2BD57',
    danger: '#FF7085',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { control: 8, card: 12, pill: 999 },
} as const;

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: tokens.color.brand,
    onPrimary: '#FFFFFF',
    primaryContainer: tokens.color.brandSoft,
    onPrimaryContainer: '#FFD9E0',
    background: tokens.color.background,
    onBackground: tokens.color.text,
    surface: tokens.color.surface,
    onSurface: tokens.color.text,
    surfaceVariant: tokens.color.surfaceRaised,
    onSurfaceVariant: tokens.color.textMuted,
    outline: tokens.color.outline,
    error: tokens.color.danger,
  },
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#B7193A',
    onPrimary: '#FFFFFF',
    primaryContainer: '#FFD9E0',
    onPrimaryContainer: '#3F0010',
    background: '#FFF8FA',
    surface: '#FFF8FA',
    surfaceVariant: '#F4EDEF',
    outline: '#847478',
  },
};
