import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';
import { BrandMark } from './BrandMark';
const MINIMUM_BOOT_MS = 850;

export function BootSequence({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const theme = useTheme();
  const [fallbackReady, setFallbackReady] = useState(false);
  const mountedAt = useRef(Date.now());
  const opacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.86)).current;
  const copyOffset = useRef(new Animated.Value(10)).current;
  const progress = useRef(new Animated.Value(0.08)).current;
  const completing = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(markOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(markScale, { toValue: 1, damping: 17, stiffness: 170, mass: 0.8, useNativeDriver: true }),
      Animated.timing(copyOffset, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0.82, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [copyOffset, markOpacity, markScale, progress]);

  useEffect(() => {
    const timer = setTimeout(() => setFallbackReady(true), 2_500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if ((!ready && !fallbackReady) || completing.current) return undefined;
    completing.current = true;
    const remaining = Math.max(0, MINIMUM_BOOT_MS - (Date.now() - mountedAt.current));
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) onComplete(); });
    }, remaining);
    return () => clearTimeout(timer);
  }, [fallbackReady, onComplete, opacity, progress, ready]);

  return (
    <Animated.View
      accessibilityLabel={ready || fallbackReady ? 'StreamNyaa is ready' : 'StreamNyaa is starting'}
      accessibilityLiveRegion="polite"
      style={[styles.root, { backgroundColor: theme.colors.background, opacity }]}
    >
      <View style={styles.center}>
        <Animated.View style={[styles.markSurface, { opacity: markOpacity, transform: [{ scale: markScale }] }]}>
          <BrandMark size={82} />
        </Animated.View>
        <Animated.View style={[styles.copy, { transform: [{ translateY: copyOffset }] }]}>
          <Text variant="headlineMedium" style={styles.wordmark}>StreamNyaa</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{ready || fallbackReady ? 'Ready' : 'Preparing your library'}</Text>
        </Animated.View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Animated.View style={[styles.progress, { backgroundColor: theme.colors.primary, transform: [{ scaleX: progress }] }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing.xl },
  center: { alignItems: 'center', gap: tokens.spacing.xl },
  markSurface: {
    width: Platform.select({ android: 96, default: 92 }),
    height: Platform.select({ android: 96, default: 92 }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { alignItems: 'center', gap: tokens.spacing.xs },
  wordmark: { fontWeight: '700' },
  track: { position: 'absolute', bottom: 48, width: 104, height: 3, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  progress: { width: '100%', height: '100%', borderRadius: tokens.radius.pill, transformOrigin: 'left' },
});
