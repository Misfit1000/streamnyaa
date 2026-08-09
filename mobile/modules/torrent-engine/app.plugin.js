const { withAndroidManifest, withGradleProperties } = require('@expo/config-plugins');

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
  return withGradleProperties(withManifest, (result) => {
    setGradleProperty(result.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setGradleProperty(result.modResults, 'android.enableBundleCompression', 'false');
    return result;
  });
};
