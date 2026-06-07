const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */

// Keep Metro's file watcher out of native build output. On Windows (no
// Watchman) the fallback watcher crashes with ENOENT when a Gradle build
// deletes/recreates dirs under android/build while Metro is watching them.
// Harmless on macOS/iOS — those paths never contain JS modules anyway.
const blockList = [
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]android[\\/]app[\\/]build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  /[\\/]android[\\/]app[\\/]\.cxx[\\/].*/,
  /[\\/]ios[\\/]build[\\/].*/,
  /[\\/]ios[\\/]Pods[\\/].*/,
];

const config = {
  resolver: {
    blockList,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
