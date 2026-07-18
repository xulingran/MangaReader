module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-.*|@react-navigation|react-native-.*|native-base|@georstat/react-native-image-cache|@shopify/flash-list|@loadable/component|react-redux|@reduxjs/toolkit|immer|redux-saga|query-string)/)',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp)$': '<rootDir>/jest.fileMock.js',
  },
  setupFiles: ['./jest.setup.js'],
};
