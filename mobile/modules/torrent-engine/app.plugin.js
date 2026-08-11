const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');

const EXPO_PACKAGE_LIST_KEEP_RULE = `
# StreamNyaa: Expo loads this generated registry with Class.forName.
-keep class expo.modules.ExpoModulesPackageList { *; }
`;

function setGradleProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) existing.value = value;
  else properties.push({ type: 'property', key, value });
}

module.exports = function withStreamNyaaTorrent(config) {
  const withManifest = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return result;
  });
  const withProperties = withGradleProperties(withManifest, (result) => {
    // Physical Android phones use ARM. Keeping both variants preserves API 24
    // era 32-bit devices while avoiding two emulator-only native payloads in
    // every release APK. Local emulator builds can override this Gradle value.
    setGradleProperty(result.modResults, 'reactNativeArchitectures', 'armeabi-v7a,arm64-v8a');
    setGradleProperty(result.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableBundleCompression', 'false');
    setGradleProperty(result.modResults, 'expo.gif.enabled', 'false');
    setGradleProperty(result.modResults, 'EX_DEV_CLIENT_NETWORK_INSPECTOR', 'false');
    return result;
  });
  return withDangerousMod(withProperties, ['android', async (result) => {
    const proguardPath = path.join(result.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const current = fs.existsSync(proguardPath) ? fs.readFileSync(proguardPath, 'utf8') : '';
    if (!current.includes('-keep class expo.modules.ExpoModulesPackageList')) {
      fs.appendFileSync(proguardPath, `${current.endsWith('\n') || !current ? '' : '\n'}${EXPO_PACKAGE_LIST_KEEP_RULE}`, 'utf8');
    }
    return result;
  }]);
};
