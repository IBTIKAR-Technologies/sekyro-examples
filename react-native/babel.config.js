module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // EXAMPLE_SERVER_URL is read at bundle time (src/config.ts). After changing it, restart Metro with --reset-cache.
  plugins: [['transform-inline-environment-variables', { include: ['EXAMPLE_SERVER_URL'] }]],
};
