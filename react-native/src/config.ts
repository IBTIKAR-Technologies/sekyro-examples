import { Platform } from 'react-native';

// The URL of examples/node-express, inlined at bundle time from the EXAMPLE_SERVER_URL environment variable
// (babel.config.js). Without it: the host machine as the Android emulator and the iOS simulator see it.
const fromEnvironment = process.env.EXAMPLE_SERVER_URL;

export const EXAMPLE_SERVER_URL: string =
  fromEnvironment && fromEnvironment.length > 0
    ? fromEnvironment
    : Platform.OS === 'android'
      ? 'http://10.0.2.2:4000'
      : 'http://localhost:4000';
