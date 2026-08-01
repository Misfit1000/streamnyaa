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
  const displayName = String(auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || 'StreamNyaa user');
  const syncLabel = auth.syncState === 'syncing' ? 'Syncing now' : auth.syncState === 'synced' ? `Synced${auth.lastSyncedAt ? ` · ${new Date(auth.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : auth.syncState === 'offline' ? 'Saved locally · sync will retry' : 'Sign in to sync';

  return (
    <Screen title="Profile" subtitle="One account across web, desktop, and Android">
      <View style={[styles.identity, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Avatar.Icon size={58} icon="account" />
        <View style={styles.identityCopy}>
          <Text variant="titleLarge" style={styles.bold} numberOfLines={1}>{displayName}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{syncLabel}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={library.filter((item) => item.bookmarked).length} label="Saved" />
        <Stat value={library.filter((item) => item.liked).length} label="Liked" />
        <Stat value={history.length} label="History" />
      </View>

      {auth.user ? <Button mode="contained-tonal" icon="sync" loading={auth.syncState === 'syncing'} onPress={() => void auth.syncNow()}>Sync now</Button> : <Button mode="contained" icon="login" onPress={() => navigation.navigate('SignIn')}>Sign in or create account</Button>}
      <Divider />
      <List.Section>
        <List.Item title="Watch history" description="Resume playback and manage progress" left={(props) => <List.Icon {...props} icon="history" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('History')} />
        <List.Item title="Compare anime" description="Scores, genres, studios, and episodes" left={(props) => <List.Icon {...props} icon="compare-horizontal" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('Compare')} />
        <List.Item title="Settings" description="Playback, theme, cache, and content" left={(props) => <List.Icon {...props} icon="cog-outline" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={() => navigation.navigate('Settings')} />
      </List.Section>
      {auth.user ? <Button mode="text" textColor={theme.colors.error} onPress={() => void auth.signOut()}>Sign out</Button> : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return <View style={styles.stat}><Text variant="headlineSmall" style={styles.bold}>{value}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg, borderRadius: tokens.radius.card },
  identityCopy: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  bold: { fontWeight: '700' },
});
