import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { tokens } from '../theme';

export function StateView({ loading, compact, title, message, onRetry }: { loading?: boolean; compact?: boolean; title?: string; message?: string; onRetry?: () => void }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.38)).current;

  useEffect(() => {
    if (!loading) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.38, duration: 700, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [loading, pulse]);

  if (loading) {
    if (compact) return <View style={styles.compact}><ActivityIndicator /><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>{message || 'Loading…'}</Text></View>;
    return (
      <Animated.View style={[styles.loading, { opacity: pulse }]} accessibilityRole="progressbar" accessibilityLabel={message || 'Loading'}>
        <View style={[styles.heroSkeleton, { backgroundColor: theme.colors.surfaceVariant }]} />
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map((item) => <View key={item} style={[styles.posterSkeleton, { backgroundColor: theme.colors.surfaceVariant }]} />)}
        </View>
        {message ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{message}</Text> : null}
      </Animated.View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]}>
      <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
        <MaterialCommunityIcons name={onRetry ? 'cloud-alert-outline' : 'movie-open-outline'} size={28} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={styles.title}>{title || 'Nothing here yet'}</Text>
      {message ? <Text style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>{message}</Text> : null}
      {onRetry ? <Button mode="contained" icon="refresh" onPress={onRetry}>Try again</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.xl, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.card },
  icon: { width: 52, height: 52, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center', marginBottom: tokens.spacing.xs },
  title: { fontWeight: '600', textAlign: 'center' },
  message: { textAlign: 'center', lineHeight: 20, maxWidth: 340 },
  loading: { minHeight: 220, gap: tokens.spacing.md, justifyContent: 'center' },
  compact: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.lg },
  heroSkeleton: { height: 118, borderRadius: tokens.radius.card },
  skeletonRow: { flexDirection: 'row', gap: tokens.spacing.md },
  posterSkeleton: { flex: 1, height: 118, borderRadius: tokens.radius.control },
});
