import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabBar, createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import type { MainTabParamList, RootStackParamList } from '../types';
import { productFeature } from '../../../shared/features';
import { MiniPlayer } from '../components/MiniPlayer';
import { View } from 'react-native';

const Root = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, [string, string]> = {
  Home: ['home-variant', 'home-variant-outline'],
  Explore: ['compass', 'compass-outline'],
  Schedule: ['calendar-month', 'calendar-month-outline'],
  Library: ['bookmark-multiple', 'bookmark-multiple-outline'],
  Profile: ['account-circle', 'account-circle-outline'],
};

const featureLabel = (id: Parameters<typeof productFeature>[0], fallback: string) => productFeature(id)?.label || fallback;

const screen = {
  home: () => require('../screens/HomeScreen').HomeScreen,
  explore: () => require('../screens/ExploreScreen').ExploreScreen,
  schedule: () => require('../screens/ScheduleScreen').ScheduleScreen,
  library: () => require('../screens/LibraryScreen').LibraryScreen,
  profile: () => require('../screens/ProfileScreen').ProfileScreen,
  anime: () => require('../screens/AnimeScreen').AnimeScreen,
  manga: () => require('../screens/MangaScreen').MangaScreen,
  catalog: () => require('../screens/CatalogScreen').CatalogScreen,
  watch: () => require('../screens/WatchScreen').WatchScreen,
  downloads: () => require('../screens/DownloadsScreen').DownloadsScreen,
  sources: () => require('../screens/SourcesScreen').SourcesScreen,
  history: () => require('../screens/HistoryScreen').HistoryScreen,
  settings: () => require('../screens/SettingsScreen').SettingsScreen,
  compare: () => require('../screens/CompareScreen').CompareScreen,
  signIn: () => require('../screens/SignInScreen').SignInScreen,
};

function MainTabs() {
  const theme = useTheme();
  return (
    <Tabs.Navigator tabBar={(props) => <MiniPlayerTabBar {...props} />} screenOptions={({ route }) => ({
      headerShown: false,
      freezeOnBlur: true,
      lazy: true,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: theme.colors.background },
      tabBarStyle: { backgroundColor: '#08080A', borderTopColor: theme.colors.outlineVariant, height: 64, paddingBottom: 5, paddingTop: 3 },
      tabBarItemStyle: { minHeight: 52, marginHorizontal: 2 },
      tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
      tabBarIcon: ({ color, size, focused }) => <MaterialCommunityIcons name={tabIcons[route.name][focused ? 0 : 1] as any} size={focused ? size + 1 : size - 1} color={color} />,
    })}>
      <Tabs.Screen name="Home" getComponent={screen.home} />
      <Tabs.Screen name="Explore" getComponent={screen.explore} options={{ title: 'Search' }} />
      <Tabs.Screen name="Schedule" getComponent={screen.schedule} options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="Library" getComponent={screen.library} />
      <Tabs.Screen name="Profile" getComponent={screen.profile} options={{ title: 'You' }} />
    </Tabs.Navigator>
  );
}

function MiniPlayerTabBar(props: BottomTabBarProps) {
  return <View><MiniPlayer onExpand={(anime, episode) => {
    (props.navigation.getParent() as any)?.navigate('Watch', { anime, episode, autoPlay: false });
  }} /><BottomTabBar {...props} /></View>;
}

export function RootNavigator() {
  const theme = useTheme();
  return (
    <Root.Navigator screenOptions={{ headerStyle: { backgroundColor: '#08080A' }, headerTintColor: theme.colors.onSurface, headerTitleStyle: { fontWeight: '600' }, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: theme.colors.background }, freezeOnBlur: false, animation: 'slide_from_right' }}>
      <Root.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Root.Screen name="Anime" getComponent={screen.anime} options={{ headerShown: false }} />
      <Root.Screen name="Manga" getComponent={screen.manga} options={({ route }) => ({ title: route.params.title || featureLabel('manga', 'Manga') })} />
      <Root.Screen name="Catalog" getComponent={screen.catalog} options={({ route }) => ({ title: route.params.title || featureLabel('catalog', 'Catalog') })} />
      <Root.Screen name="Watch" getComponent={screen.watch} options={{ headerShown: false, animation: 'fade_from_bottom', freezeOnBlur: false }} />
      <Root.Screen name="Downloads" getComponent={screen.downloads} options={{ title: 'Release browser' }} />
      <Root.Screen name="Sources" getComponent={screen.sources} options={{ title: 'Sources' }} />
      <Root.Screen name="History" getComponent={screen.history} options={{ title: 'History' }} />
      <Root.Screen name="Settings" getComponent={screen.settings} options={{ title: 'Settings' }} />
      <Root.Screen name="Compare" getComponent={screen.compare} options={{ title: 'Compare' }} />
      <Root.Screen name="SignIn" getComponent={screen.signIn} options={{ title: 'Account', presentation: 'modal' }} />
    </Root.Navigator>
  );
}
