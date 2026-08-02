import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme as NavigationDark, DefaultTheme as NavigationLight } from '@react-navigation/native';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { BootSequence } from './components/BootSequence';
import { PermissionOnboarding } from './components/PermissionOnboarding';
import { AuthProvider } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store/useAppStore';
import { darkTheme, lightTheme } from './theme';

export default function App() {
  const system = useColorScheme();
  const mode = useAppStore((state) => state.themeMode);
  const hydrated = useAppStore((state) => state.hydrated);
  const permissionsOnboardingCompleted = useAppStore((state) => state.permissionsOnboardingCompleted);
  const completePermissionsOnboarding = useAppStore((state) => state.completePermissionsOnboarding);
  const [navigationReady, setNavigationReady] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const nativeSplashHidden = useRef(false);
  const dark = mode === 'dark' || (mode === 'system' && system !== 'light');
  const paperTheme = dark ? darkTheme : lightTheme;
  const navigationTheme = useMemo(() => ({
    ...(dark ? NavigationDark : NavigationLight),
    colors: { ...(dark ? NavigationDark.colors : NavigationLight.colors), background: paperTheme.colors.background, card: paperTheme.colors.surface, text: paperTheme.colors.onSurface, primary: paperTheme.colors.primary, border: paperTheme.colors.outline },
  }), [dark, paperTheme]);

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      focusManager.setFocused(active);
      if (!active) void queryClient.cancelQueries();
    });
    return () => subscription.remove();
  }, []);

  const hideNativeSplash = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const completeBoot = useCallback(() => setBootComplete(true), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={paperTheme}>
            <View style={styles.root} onLayout={hideNativeSplash}>
              <AuthProvider>
                <NavigationContainer theme={navigationTheme} onReady={() => setNavigationReady(true)}>
                  <StatusBar style={dark ? 'light' : 'dark'} />
                  <RootNavigator />
                </NavigationContainer>
              </AuthProvider>
              {!bootComplete ? <BootSequence ready={hydrated && navigationReady} onComplete={completeBoot} /> : null}
              <PermissionOnboarding visible={bootComplete && hydrated && !permissionsOnboardingCompleted} onComplete={completePermissionsOnboarding} />
            </View>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
