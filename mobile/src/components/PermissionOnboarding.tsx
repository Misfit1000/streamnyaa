import { useEffect, useState } from 'react';
import { AppState, Image, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Text, useTheme } from 'react-native-paper';
import {
  getNotificationPermissionState,
  openAppPermissionSettings,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../services/permissions';
import { tokens } from '../theme';

const logo = require('../../../src/assets/desktop-logo.png');

export function PermissionOnboarding({ visible, onComplete }: { visible: boolean; onComplete: () => void }) {
  const theme = useTheme();
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const refresh = () => void getNotificationPermissionState()
      .then((next) => { if (active) setPermission(next); })
      .catch(() => { if (active) setPermission({ granted: false, canAskAgain: true, status: 'undetermined' as NotificationPermissionState['status'] }); });
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [visible]);

  const primaryAction = async () => {
    if (permission?.granted) { onComplete(); return; }
    if (permission && !permission.canAskAgain) { await openAppPermissionSettings(); return; }
    setBusy(true);
    try {
      const next = await requestNotificationPermission();
      setPermission(next);
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  const notificationStatus = permission?.granted ? 'Allowed' : permission && !permission.canAskAgain ? 'Blocked in Android settings' : 'Optional';
  const primaryLabel = permission?.granted ? 'Continue' : permission && !permission.canAskAgain ? 'Open Android settings' : 'Allow notifications';

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onComplete}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} accessibilityViewIsModal>
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={[styles.logoSurface, { backgroundColor: theme.colors.surfaceVariant }]}><Image source={logo} resizeMode="contain" style={styles.logo} accessibilityIgnoresInvertColors /></View>
            <View style={styles.brandCopy}>
              <Text variant="headlineSmall" style={styles.title}>Before you start</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>StreamNyaa asks only for access needed by the feature you choose.</Text>
            </View>
          </View>

          <View style={styles.permissions}>
            <PermissionRow icon="access-point" title="Online catalog and streaming" detail="Internet access is automatic while the app is in use." status="Ready" />
            <PermissionRow icon="bell-outline" title="Airing reminders" detail="Allow optional alerts for episodes you ask to be reminded about." status={notificationStatus} emphasized={!permission?.granted} />
            <PermissionRow icon="folder-lock-outline" title="Private streaming cache" detail="Video buffers stay inside StreamNyaa. File and photo access are not requested." status="Private" />
          </View>

          <View style={styles.actions}>
            <Button mode="contained" loading={busy || !permission} disabled={busy || !permission} onPress={() => void primaryAction()} contentStyle={styles.button}>{primaryLabel}</Button>
            {!permission?.granted ? <Button mode="text" disabled={busy} onPress={onComplete}>Not now</Button> : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PermissionRow({ icon, title, detail, status, emphasized = false }: { icon: string; title: string; detail: string; status: string; emphasized?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: emphasized ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]}>
        <MaterialCommunityIcons name={icon as any} size={24} color={emphasized ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitle}>
          <Text variant="titleSmall" style={styles.semibold}>{title}</Text>
          <Text variant="labelSmall" style={{ color: emphasized ? theme.colors.primary : theme.colors.onSurfaceVariant }}>{status}</Text>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: tokens.spacing.xl, paddingVertical: Platform.select({ android: tokens.spacing.xl, default: tokens.spacing.lg }), justifyContent: 'space-between', gap: tokens.spacing.xl },
  brand: { gap: tokens.spacing.xl, paddingTop: tokens.spacing.lg },
  logoSurface: { width: 72, height: 72, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 50, height: 50 },
  brandCopy: { gap: tokens.spacing.sm, maxWidth: 440 },
  title: { fontWeight: '700' },
  permissions: { gap: tokens.spacing.xl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  icon: { width: 48, height: 48, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: tokens.spacing.xs, paddingTop: 2 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  semibold: { fontWeight: '600', flexShrink: 1 },
  actions: { gap: tokens.spacing.xs },
  button: { minHeight: 48 },
});
