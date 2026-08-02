import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { enableFreeze, enableScreens } from 'react-native-screens';
import App from './src/App';

enableScreens(true);
enableFreeze(true);
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

registerRootComponent(App);
