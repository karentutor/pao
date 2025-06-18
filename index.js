// Tell Expo Router where the app directory is
process.env.EXPO_ROUTER_APP_ROOT = 'src/app';

// Hand control to Expo Router’s entry file
require('expo-router/entry');