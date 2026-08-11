import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Text } from 'react-native-paper';
import { recordSupportEvent } from '../services/supportDiagnostics';
import { tokens } from '../theme';

type State = { error?: Error; recoveryKey: number };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { recoveryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('StreamNyaa recovered from a UI error', error, info.componentStack);
    recordSupportEvent({
      level: 'error',
      stage: 'react-ui',
      code: 'REACT_ERROR_BOUNDARY',
      message: error.message || error.name,
      context: { componentStack: info.componentStack?.slice(0, 160) },
    });
  }

  private recover = () => this.setState((state) => ({ error: undefined, recoveryKey: state.recoveryKey + 1 }));

  render() {
    if (!this.state.error) return <View key={this.state.recoveryKey} style={styles.content}>{this.props.children}</View>;
    return (
      <View style={styles.fallback}>
        <View style={styles.mark}><MaterialCommunityIcons name="play" size={34} color="#FFFFFF" /></View>
        <Text variant="headlineSmall" style={styles.title}>Playback UI recovered</Text>
        <Text variant="bodyMedium" style={styles.message}>The current screen stopped unexpectedly. Your library and watch history are safe.</Text>
        <Button mode="contained" icon="refresh" onPress={this.recover} contentStyle={styles.button}>Return to StreamNyaa</Button>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md, padding: tokens.spacing.xxl, backgroundColor: tokens.color.background },
  mark: { width: 68, height: 68, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandDeep, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.outlineBrand },
  title: { color: tokens.color.text, fontWeight: '700', textAlign: 'center' },
  message: { color: tokens.color.textMuted, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
  button: { minHeight: 48 },
});
