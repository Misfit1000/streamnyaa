import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { tokens } from '../theme';

export function StateView({ loading, title, message, onRetry }: { loading?: boolean; title?: string; message?: string; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      {loading ? <ActivityIndicator size="large" /> : <MaterialCommunityIcons name="cat" size={42} color={theme.colors.primary} />}
      <Text variant="titleMedium" style={styles.title}>{loading ? 'Loading' : title || 'Nothing here yet'}</Text>
      {message ? <Text style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>{message}</Text> : null}
      {onRetry ? <Button mode="contained-tonal" onPress={onRetry}>Try again</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.xl },
  title: { fontWeight: '600' },
  message: { textAlign: 'center', lineHeight: 20 },
});
