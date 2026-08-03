import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, List, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Profile'>, NativeStackScreenProps<RootStackParamList>>;

export function ProfileScreen({ navigation }: Props) {
  const theme = useTheme();
  const auth = useAuth();
  const library = useAppStore((state) => state.library);
  const history = useAppStore((state) => state.history);
  const counts = library.reduce((result, item) => ({ saved: result.saved + Number(item.bookmarked), liked: result.liked + Number(item.liked) }), { saved: 0, liked: 0 });
  const displayName = String(auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || 'StreamNyaa user');
  const syncLabel = auth.syncState === 'syncing' ? 'Syncing now' : auth.syncState === 'synced' ? `Synced${auth.lastSyncedAt ? ` · ${new Date(auth.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : auth.syncState === 'offline' ? 'Saved locally · sync will retry' : 'Sign in to sync across devices';

  return (
    <Screen title="Profile" subtitle="One account across web, desktop, and Android">
      <View style={[styles.identity, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]}>
        <Avatar.Icon size={64} icon="account" color="#FFFFFF" style={{ backgroundColor: tokens.color.brandDeep }} />
        <View style={styles.identityCopy}>
          <Text variant="titleLarge" style={styles.bold} numberOfLines={1}>{displayName}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{syncLabel}</Text>
          {auth.user ? <Text variant="labelSmall" style={{ color: theme.colors.primary }}>{auth.user.email}</Text> : null}
        </View>
      </View>

      <View style={[styles.stats, { borderColor: theme.colors.outlineVariant }]}>
        <Stat value={counts.saved} label="Saved" />
        <View style={[styles.statDivider, { backgroundColor: theme.colors.outlineVariant }]} />
        <Stat value={counts.liked} label="Liked" />
        <View style={[styles.statDivider, { backgroundColor: theme.colors.outlineVariant }]} />
        <Stat value={history.length} label="Watched" />
      </View>

      {auth.user ? <Button mode="contained-tonal" icon="sync" loading={auth.syncState === 'syncing'} onPress={() => void auth.syncNow()} contentStyle={styles.button}>Sync now</Button> : <Button mode="contained" icon="login" onPress={() => navigation.navigate('SignIn')} contentStyle={styles.button}>Sign in or create account</Button>}
      <Divider />
      <List.Section style={styles.list}>
        <List.Item title="Watch history" description="Resume playback and manage progress" left={(props) => <List.Icon {...props} icon="history" color={theme.colors.primary} />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('History')} />
        <List.Item title="Compare anime" description="Scores, genres, studios, and episodes" left={(props) => <List.Icon {...props} icon="compare-horizontal" color={theme.colors.primary} />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('Compare')} />
        <List.Item title="Settings" description="Playback, theme, cache, and content" left={(props) => <List.Icon {...props} icon="cog-outline" color={theme.colors.primary} />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('Settings')} />
      </List.Section>
      {auth.user ? <Button mode="text" textColor={theme.colors.error} onPress={() => void auth.signOut()}>Sign out</Button> : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return <View style={styles.stat}><Text variant="headlineSmall" style={styles.bold}>{value}</Text><Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg, padding: tokens.spacing.lg, borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth },
  identityCopy: { flex: 1, gap: 3 },
  stats: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: tokens.spacing.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 38 },
  button: { minHeight: 48 },
  list: { marginHorizontal: -tokens.spacing.sm },
  bold: { fontWeight: '700' },
});
