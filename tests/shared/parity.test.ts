import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCT_FEATURES } from '../../shared/features';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktopNavigator = readFileSync(path.join(repoRoot, 'src/AppDesktop.tsx'), 'utf8');
const mobileNavigator = readFileSync(path.join(repoRoot, 'mobile/src/navigation/RootNavigator.tsx'), 'utf8');

test('feature contract has a unique Android route and at least one desktop path', () => {
  const mobileRoutes = PRODUCT_FEATURES.map((feature) => feature.mobileRoute);
  assert.equal(new Set(mobileRoutes).size, mobileRoutes.length);
  PRODUCT_FEATURES.forEach((feature) => assert.ok(feature.desktopPaths.length > 0, `${feature.id} needs a desktop path`));
});

test('every feature contract is represented in both navigators', () => {
  PRODUCT_FEATURES.forEach((feature) => {
    if (feature.id !== 'home') {
      assert.match(desktopNavigator, new RegExp(`desktopPath\\('${feature.id}'`), `Desktop is missing ${feature.id}`);
    }
    assert.ok(
      mobileNavigator.includes(`name=\"${feature.mobileRoute}\"`) || mobileNavigator.includes(`${feature.mobileRoute}:`),
      `Android is missing ${feature.mobileRoute}`,
    );
  });
});

test('Android parity covers the desktop workflows inside each route', () => {
  const expectations: Record<string, string[]> = {
    'ExploreScreen.tsx': ['useInfiniteQuery', 'recentExploreSearches', 'Refine results', 'Minimum score', 'Episode count'],
    'ScheduleScreen.tsx': ['Saved (', 'airingReminders', 'cancelAiringReminder', 'toggleBookmark'],
    'LibraryScreen.tsx': ["'watching'", "'completed'", "'saved'", "'liked'", 'ProgressBar'],
    'WatchScreen.tsx': ['episodeDraft', 'sourceFilter', 'sourceSort', 'selectBackupSource', 'allowsPictureInPicture'],
    'DownloadsScreen.tsx': ['sourceQualityLabel', 'Trusted', 'No remakes', 'Most seeders'],
    'HistoryScreen.tsx': ["'recent'", "'progress'", "'title'", "'episode'", 'Last 7 days'],
    'CompareScreen.tsx': ['Popularity', 'Quick read', 'sharedGenres', 'A releases'],
    'SettingsScreen.tsx': ['runConnectionDiagnostics', 'App health', 'Native streaming engine'],
  };
  Object.entries(expectations).forEach(([file, signals]) => {
    const source = readFileSync(path.join(repoRoot, 'mobile/src/screens', file), 'utf8');
    signals.forEach((signal) => assert.ok(source.includes(signal), `${file} is missing ${signal}`));
  });
});

test('Android anime discovery enters the integrated cinema instead of a web details flow', () => {
  const screenNames = ['HomeScreen.tsx', 'ExploreScreen.tsx', 'CatalogScreen.tsx', 'LibraryScreen.tsx', 'ScheduleScreen.tsx'];
  screenNames.forEach((file) => {
    const source = readFileSync(path.join(repoRoot, 'mobile/src/screens', file), 'utf8');
    assert.ok(!source.includes("navigate('Anime'"), `${file} still opens the legacy details route`);
  });
  const watch = readFileSync(path.join(repoRoot, 'mobile/src/screens/WatchScreen.tsx'), 'utf8');
  ['WatchHero', 'EpisodeRail', 'AnimeShelf', 'selectBackupSource'].forEach((signal) => assert.ok(watch.includes(signal), `WatchScreen is missing ${signal}`));
});
