module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-.*|@react-navigation|react-native-.*|native-base|@georstat/react-native-image-cache|@shopify/flash-list|@loadable/component|react-redux|@reduxjs/toolkit|immer|redux-saga|query-string)/)',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp)$': '<rootDir>/jest.fileMock.js',
  },
  setupFiles: ['./jest.setup.js'],
  // __tests__/helpers 是测试公用工具（mock/工厂），不是测试套件，排除避免 Jest 报「no tests」
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/'],
  // 覆盖率只统计 src/，排除类型声明、schema 生成产物与 index 汇总文件
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/schema/**',
    '!src/**/index.ts',
    '!src/types/**',
  ],
  // 防回退阈值：略低于当前基线（语句 ~43% / 分支 ~33% / 函数 ~35% / 行 ~44%），
  // 任何让覆盖率下降的改动都会让 yarn coverage 失败。L3 目标 60%，逐步收紧。
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 33,
      lines: 40,
    },
  },
};
