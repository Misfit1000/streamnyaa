import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import type { MainTabParamList, RootStackParamList } from '../types';
import { HomeScreen } from '../screens/HomeScreen';
import { ExploreScreen } from '../screens/ExploreScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AnimeScreen } from '../screens/AnimeScreen';
import { WatchScreen } from '../screens/WatchScreen';
import { SourcesScreen } from '../screens/SourcesScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CompareScreen } from '../screens/CompareScreen';
import { SignInScreen } from '../screens/SignInScreen';

const Root = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, string> = {
  Home: 'home-variant-outline', Explore: 'compass-outline', Schedule: 'calendar-month-outline', Library: 'bookmark-multiple-outline', Profile: 'account-circle-outline',
};

function MainTabs() {
  const theme = useTheme();
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
      tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline, height: 72, paddingBottom: 10, paddingTop: 6 },
      tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
      tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={tabIcons[route.name] as any} size={size} color={color} />,
    })}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Explore" component={ExploreScreen} />
      <Tabs.Screen name="Schedule" component={ScheduleScreen} />
      <Tabs.Screen name="Library" component={LibraryScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const theme = useTheme();
  return (
    <Root.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.onSurface, headerTitleStyle: { fontWeight: '600' }, headerShadowVisible: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Root.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Root.Screen name="Anime" component={AnimeScreen} options={({ route }) => ({ title: route.params.title || 'Anime' })} />
      <Root.Screen name="Watch" component={WatchScreen} options={{ title: 'Watch' }} />
      <Root.Screen name="Sources" component={SourcesScreen} options={{ title: 'Sources' }} />
      <Root.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <Root.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Root.Screen name="Compare" component={CompareScreen} options={{ title: 'Compare' }} />
      <Root.Screen name="SignIn" component={SignInScreen} options={{ title: 'Account', presentation: 'modal' }} />
    </Root.Navigator>
  );
}
