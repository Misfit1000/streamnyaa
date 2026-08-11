import { useEffect, useState } from 'react';
import { Alert, AppState, Share, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Divider, List, RadioButton, SegmentedButtons, Snackbar, Switch, Text } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { TorrentEngine } from '../native/TorrentEngine';
import { getNotificationPermissionState, openAppPermissionSettings, requestNotificationPermission, type NotificationPermissionState } from '../services/permissions';
import { runConnectionDiagnostics, type ConnectionDiagnostic } from '../services/diagnostics';
import { buildSupportReport, clearSupportDiagnostics, getSupportEvents, recordSupportEvent } from '../services/supportDiagnostics';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList, TorrentCacheEntry } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen(_props: Props) {
  const store = useAppStore();
  const [message, setMessage] = useState('');
  const [cacheBytes, setCacheBytes] = useState(0);
  const [cacheEntries, setCacheEntries] = useState<TorrentCacheEntry[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState | null>(null);
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostic[]>([]);
  const [checkingConnections, setCheckingConnections] = useState(false);
  const [exportingSupport, setExportingSupport] = useState(false);
  const [supportEventCount, setSupportEventCount] = useState(0);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const refreshCache = () => void Promise.all([TorrentEngine.getCacheStats(), TorrentEngine.listCacheEntries()])
    .then(([stats, entries]) => { setCacheBytes(stats.bytes); setCacheEntries(entries); })
    .catch(() => { setCacheBytes(0); setCacheEntries([]); });
  const refreshPermission = () => void getNotificationPermissionState()
    .then(setNotificationPermission)
    .catch(() => setNotificationPermission(null));
  useEffect(() => {
    refreshCache();
    refreshPermission();
    void getSupportEvents().then((events) => setSupportEventCount(events.length));
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refreshPermission(); });
    return () => subscription.remove();
  }, []);

  const updateNotificationPermission = async () => {
    if (notificationPermission && !notificationPermission.granted && !notificationPermission.canAskAgain) {
      await openAppPermissionSettings();
      return;
    }
    const next = await requestNotificationPermission();
    setNotificationPermission(next);
    setMessage(next.granted ? 'Airing reminders are enabled.' : 'Notifications were not enabled. You can change this later.');
  };
  const checkConnections = async () => {
    setCheckingConnections(true);
    const next = await runConnectionDiagnostics();
    setDiagnostics(next);
    next.forEach((item) => recordSupportEvent({
      level: item.ok ? 'info' : 'warning',
      stage: 'connection-check',
      code: `${item.id.toUpperCase()}_${item.ok ? 'AVAILABLE' : 'FAILED'}`,
      message: item.message,
      context: { latencyMs: item.latencyMs },
    }));
    setCheckingConnections(false);
    const failed = next.filter((item) => !item.ok).length;
    setMessage(failed ? `${failed} connection ${failed === 1 ? 'check needs' : 'checks need'} attention.` : 'Metadata, source, and account services are reachable.');
  };
  const exportSupportReport = async () => {
    setExportingSupport(true);
    try {
      const connections = diagnostics.length ? diagnostics : await runConnectionDiagnostics();
      if (!diagnostics.length) setDiagnostics(connections);
      const report = await buildSupportReport({
        connections,
        preferences: {
          audioPreference: store.audioPreference,
          autoOpenBestSource: store.autoOpenBestSource,
          balancedFileSize: store.resourcePolicy.balancedFileSize,
          batterySaver: store.resourcePolicy.batterySaver,
          wifiOnly: store.resourcePolicy.wifiOnly,
          performanceProfile: store.resourcePolicy.performanceProfile,
          maxCacheMiB: store.resourcePolicy.maxCacheMiB,
          autoSkipIntro: store.playerPreferences.autoSkipIntro,
          autoSkipOutro: store.playerPreferences.autoSkipOutro,
          playbackSpeed: store.playerPreferences.playbackSpeed,
        },
      });
      await Share.share({ title: 'StreamNyaa Android support report', message: JSON.stringify(report, null, 2) });
      setSupportEventCount((await getSupportEvents()).length);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The support report could not be created.');
    } finally {
      setExportingSupport(false);
    }
  };
  const clearDiagnosticHistory = () => Alert.alert(
    'Clear diagnostic history?',
    'This removes only local engine and playback troubleshooting events.',
    [
      { text: 'Cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void clearSupportDiagnostics().then(() => { setSupportEventCount(0); setMessage('Diagnostic history cleared.'); }) },
    ],
  );
  return (
    <Screen safeTop={false}>
      <List.Section title="Appearance">
        <RadioButton.Group value={store.themeMode} onValueChange={(value) => store.setThemeMode(value as typeof store.themeMode)}>
          <RadioButton.Item label="Use device theme" value="system" />
          <RadioButton.Item label="Dark" value="dark" />
          <RadioButton.Item label="Light" value="light" />
        </RadioButton.Group>
      </List.Section>
      <Divider />
      <List.Section title="Content">
        <List.Item title="Include adult titles" description="SFW mode is enabled by default" right={() => <Switch value={store.nsfwMode} onValueChange={store.setNsfwMode} />} />
      </List.Section>
      <Divider />
      <List.Section title="Permissions">
        <List.Item
          title="Airing notifications"
          description={notificationPermission?.granted ? 'Allowed for reminders you schedule' : notificationPermission && !notificationPermission.canAskAgain ? 'Blocked in Android settings' : 'Optional; requested only for airing reminders'}
          left={(props) => <List.Icon {...props} icon={notificationPermission?.granted ? 'bell-check-outline' : 'bell-outline'} />}
          right={() => <Button compact disabled={!notificationPermission || notificationPermission.granted} onPress={() => void updateNotificationPermission()}>{notificationPermission?.granted ? 'Allowed' : notificationPermission && !notificationPermission.canAskAgain ? 'Settings' : 'Allow'}</Button>}
        />
        <List.Item title="Files and photos" description="Not requested; streaming cache stays in private app storage" left={(props) => <List.Icon {...props} icon="folder-lock-outline" />} />
      </List.Section>
      <Divider />
      <List.Section title="Playback">
        <Text variant="labelLarge" style={styles.label}>Preferred audio</Text>
        <RadioButton.Group value={store.audioPreference} onValueChange={(value) => store.setAudioPreference(value as typeof store.audioPreference)}>
          <RadioButton.Item label="Prefer subtitles" value="sub-preferred" />
          <RadioButton.Item label="Prefer dual audio" value="dual-preferred" />
          <RadioButton.Item label="Dub only" value="dub-only" />
        </RadioButton.Group>
        <List.Item title="Auto-play next episode" right={() => <Switch value={store.autoPlayNext} onValueChange={store.setAutoPlayNext} />} />
        <List.Item title="Open best source automatically" description="Starts the highest-ranked source when a watch page opens" right={() => <Switch value={store.autoOpenBestSource} onValueChange={store.setAutoOpenBestSource} />} />
        <List.Item title="Auto-skip intros" description="Uses verified episode timing when available" right={() => <Switch value={store.playerPreferences.autoSkipIntro} onValueChange={(autoSkipIntro) => store.setPlayerPreferences({ autoSkipIntro })} />} />
        <List.Item title="Auto-skip outros" description="Manual skip buttons remain available when this is off" right={() => <Switch value={store.playerPreferences.autoSkipOutro} onValueChange={(autoSkipOutro) => store.setPlayerPreferences({ autoSkipOutro })} />} />
        <Text variant="labelLarge" style={styles.label}>Playback speed</Text>
        <SegmentedButtons
          value={String(store.playerPreferences.playbackSpeed)}
          onValueChange={(value) => store.setPlayerPreferences({ playbackSpeed: Number(value) })}
          buttons={[
            { value: '0.75', label: '0.75×' },
            { value: '1', label: '1×' },
            { value: '1.25', label: '1.25×' },
            { value: '1.5', label: '1.5×' },
          ]}
          density="small"
        />
      </List.Section>
      <Divider />
      <List.Section title="Battery and data">
        <List.Item title="Balanced file size" description="Prefer high-quality, well-seeded releases from 300 MB to 1 GB" right={() => <Switch value={store.resourcePolicy.balancedFileSize} onValueChange={(balancedFileSize) => store.setResourcePolicy({ balancedFileSize })} />} />
        <List.Item title="Battery saver" description="Polls torrent status less often and writes progress every 15 seconds" right={() => <Switch value={store.resourcePolicy.batterySaver} onValueChange={(batterySaver) => store.setResourcePolicy({ batterySaver })} />} />
        <List.Item title="Stream on Wi-Fi only" description="Blocks new torrent sessions on cellular data" right={() => <Switch value={store.resourcePolicy.wifiOnly} onValueChange={(wifiOnly) => store.setResourcePolicy({ wifiOnly })} />} />
        <List.Item title="Background playback" description="Continue streaming when StreamNyaa is not visible; picture-in-picture always remains supported" right={() => <Switch value={store.resourcePolicy.allowBackgroundPlayback} onValueChange={(allowBackgroundPlayback) => store.setResourcePolicy({ allowBackgroundPlayback })} />} />
        <Text variant="labelLarge" style={styles.label}>Performance profile</Text>
        <SegmentedButtons value={store.resourcePolicy.performanceProfile} onValueChange={(value) => store.setResourcePolicy({ performanceProfile: value as typeof store.resourcePolicy.performanceProfile })} buttons={[{ value: 'auto', label: 'Auto' }, { value: 'standard', label: 'Standard' }, { value: 'constrained', label: 'Low RAM' }]} density="small" />
        <Text variant="bodySmall" style={styles.helper}>Auto detects Android low-RAM devices. Low RAM mode reduces image memory, torrent connections, and player buffering.</Text>
        <Text variant="labelLarge" style={styles.label}>Maximum streaming cache</Text>
        <RadioButton.Group value={String(store.resourcePolicy.maxCacheMiB)} onValueChange={(value) => store.setResourcePolicy({ maxCacheMiB: Number(value) })}>
          <RadioButton.Item label="1 GB" value="1024" />
          <RadioButton.Item label="2 GB" value="2048" />
          <RadioButton.Item label="4 GB" value="4096" />
        </RadioButton.Group>
      </List.Section>
      <List.Section title="Storage and local data">
        <List.Item title="Streaming cache" description={`${(cacheBytes / 1024 / 1024).toFixed(1)} MB used · ${store.resourcePolicy.maxCacheMiB} MB limit`} left={(props) => <List.Icon {...props} icon="harddisk" />} />
        {cacheEntries.slice(0, 8).map((entry) => <View key={entry.infoHash} style={styles.cacheEntry}>
          <View style={styles.cacheCopy}><Text variant="labelLarge" numberOfLines={1} style={styles.semibold}>{entry.animeTitle || entry.fileName || 'Cached release'}</Text><Text variant="labelSmall" numberOfLines={1}>{entry.episode ? `Episode ${entry.episode} · ` : ''}{(entry.bytes / 1024 / 1024).toFixed(0)} MB{entry.active ? ' · Playing' : ''}</Text></View>
          <Button compact disabled={entry.active} onPress={() => void TorrentEngine.removeCacheEntry(entry.infoHash).then((bytes) => { setMessage(`Removed ${(bytes / 1024 / 1024).toFixed(1)} MB.`); refreshCache(); })}>{entry.active ? 'Active' : 'Remove'}</Button>
        </View>)}
        <Button mode="outlined" icon="delete-sweep-outline" onPress={() => void TorrentEngine.clearCache().then((bytes) => { refreshCache(); setMessage(`Cleared ${(bytes / 1024 / 1024).toFixed(1)} MB of inactive cached source data.`); }).catch((error) => setMessage(error.message))}>Clear streaming cache</Button>
        <Button mode="text" icon="history" onPress={() => Alert.alert('Clear watch history?', 'This removes progress from all synced clients after the next account sync.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clearHistory }])}>Clear watch history</Button>
      </List.Section>
      <Divider />
      <List.Section title="App health">
        <List.Item title="Native streaming engine" description={TorrentEngine.isSupported() ? 'Loaded and available' : 'Use an Android development or release build'} left={(props) => <List.Icon {...props} icon={TorrentEngine.isSupported() ? 'check-circle-outline' : 'alert-circle-outline'} />} />
        <List.Item title="Diagnostic history" description={`${supportEventCount} recent playback events saved locally · no account data`} left={(props) => <List.Icon {...props} icon="clipboard-pulse-outline" />} />
        {diagnostics.map((item) => <List.Item key={item.id} title={item.label} description={item.message} left={(props) => <List.Icon {...props} icon={item.ok ? 'check-circle-outline' : 'alert-circle-outline'} color={item.ok ? undefined : '#FF6B82'} />} />)}
        <Button mode="outlined" icon="lan-check" loading={checkingConnections} disabled={checkingConnections} onPress={() => void checkConnections()}>Run connection check</Button>
        <Button mode="contained" icon="share-variant-outline" loading={exportingSupport} disabled={exportingSupport} onPress={() => void exportSupportReport()}>Export support report</Button>
        <Button mode="text" icon="delete-outline" disabled={!supportEventCount} onPress={clearDiagnosticHistory}>Clear diagnostic history</Button>
      </List.Section>
      <Text variant="bodySmall">Streaming caches only the selected media file in private app storage. Old inactive source caches are removed automatically when the limit is reached.</Text>
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')}>{message}</Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 16, paddingTop: 8 },
  helper: { paddingHorizontal: 16, color: tokens.color.textMuted },
  cacheEntry: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.color.outline },
  cacheCopy: { flex: 1, minWidth: 0, gap: 3 },
  semibold: { fontWeight: '600' },
});
