const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('jsx', 'js');
config.resolver.extraNodeModules = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;

