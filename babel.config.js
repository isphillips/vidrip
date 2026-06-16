module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // VisionCamera v4 frame processors run on react-native-worklets-core. Its plugin must
    // come BEFORE reanimated's (reanimated's plugin has to be last).
    ['react-native-worklets-core/plugin'],
    'react-native-reanimated/plugin',
  ],
};
