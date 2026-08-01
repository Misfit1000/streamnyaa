import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
}>;

export function Screen({ title, subtitle, action, scroll = true, children, contentContainerStyle }: Props) {
  const theme = useTheme();
  const content = (
    <View style={[styles.content, contentContainerStyle]}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text variant="headlineSmall" style={styles.title}>{title}</Text>
            {subtitle ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md, paddingTop: tokens.spacing.sm },
  headerCopy: { flex: 1, gap: tokens.spacing.xs },
  title: { fontWeight: '700' },
});
