const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

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
  const withSafeAdaptiveIcon = withDangerousMod(withManifest, ['android', async (result) => {
    const resources = path.join(result.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    const drawable = path.join(resources, 'drawable', 'streamnyaa_adaptive_foreground.xml');
    await fs.mkdir(path.dirname(drawable), { recursive: true });
    await fs.writeFile(drawable, `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:inset="16%" />
`, 'utf8');
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const iconPath = path.join(resources, 'mipmap-anydpi-v26', name);
      const xml = await fs.readFile(iconPath, 'utf8');
      await fs.writeFile(iconPath, xml.replace('@mipmap/ic_launcher_foreground', '@drawable/streamnyaa_adaptive_foreground'), 'utf8');
    }
    return result;
  }]);
  return withGradleProperties(withSafeAdaptiveIcon, (result) => {
    setGradleProperty(result.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableBundleCompression', 'false');
    return result;
  });
};
