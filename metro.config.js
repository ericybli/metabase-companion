// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep test files out of the app bundle. Expo Router's require.context scans the
// entire app directory, so co-located *.test/*.spec files (and their dev-only
// imports such as @testing-library/react-native) would otherwise be pulled into
// the production bundle and break it. Jest is unaffected — it has its own config.
const testFilePattern = /.*\.(test|spec)\.[jt]sx?$/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, testFilePattern)
  : testFilePattern;

module.exports = config;
