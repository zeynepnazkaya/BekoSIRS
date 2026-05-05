module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-module-resolver',
        {
          alias: {
            'react-native-maps': '@teovilla/react-native-web-maps',
          },
        },
      ],
    ],
  };
};
