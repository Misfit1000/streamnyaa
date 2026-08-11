import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

export function SignInScreen({ navigation }: Props) {
  const theme = useTheme();
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (!email.trim() || password.length < 6) { setMessage('Enter a valid email and a password of at least 6 characters.'); return; }
    setBusy(true); setMessage('');
    try {
      if (mode === 'signin') await auth.signIn(email.trim(), password);
      else await auth.signUp(email.trim(), password);
      navigation.goBack();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  const submitGoogle = async () => {
    setBusy(true); setMessage('');
    try {
      await auth.signInGoogle();
      navigation.goBack();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Google sign-in failed.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen safeTop={false}>
      <KeyboardAvoidingView behavior="padding" style={styles.form}>
        <View style={styles.brand}><BrandMark size={64} /><Text variant="titleLarge" style={styles.brandName}>StreamNyaa</Text></View>
        <SegmentedButtons value={mode} onValueChange={(value) => setMode(value as typeof mode)} buttons={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
        <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" mode="outlined" />
        <TextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} mode="outlined" />
        {message || auth.error ? <Text style={{ color: theme.colors.error }}>{message || auth.error}</Text> : null}
        <Button mode="contained" loading={busy} disabled={busy} onPress={() => void submit()}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
        <View style={styles.divider}><View style={[styles.line, { backgroundColor: theme.colors.outline }]} /><Text>or</Text><View style={[styles.line, { backgroundColor: theme.colors.outline }]} /></View>
        <Button mode="outlined" icon="google" loading={busy} disabled={busy} onPress={() => void submitGoogle()}>Continue with Google</Button>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: tokens.spacing.lg },
  brand: { alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm },
  brandName: { fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
