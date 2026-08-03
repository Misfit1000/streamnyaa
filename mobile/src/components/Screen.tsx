import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  scroll?: boolean;
  safeTop?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
}>;

export function Screen({ title, subtitle, action, scroll = true, safeTop = true, children, contentContainerStyle }: Props) {
  const theme = useTheme();
  const content = (
    <View style={[styles.content, contentContainerStyle]}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text variant="headlineMedium" style={styles.title}>{title}</Text>
            {subtitle ? <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text> : null}
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={safeTop ? ['top'] : []} style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <LinearGradient colors={['rgba(99, 4, 25, 0.20)', 'rgba(3, 3, 4, 0.96)', theme.colors.background]} locations={[0, 0.22, 0.58]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md, paddingTop: tokens.spacing.sm, minHeight: 60 },
  headerCopy: { flex: 1, gap: tokens.spacing.xs },
  title: { fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { lineHeight: 20, maxWidth: 420 },
  action: { marginRight: -tokens.spacing.sm },
});
