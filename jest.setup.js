/* eslint-disable no-undef */
// jest 全局原生模块 mock（电子墨水版 Android-only）

import 'react-native-gesture-handler/jestSetup';

// jest 环境缺少原生渲染器，react-redux 派发时会调用 unstable_batchedUpdates
// 这里补一个同步执行的降级实现，避免 saga dispatch 崩溃
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const shim = require('react-native/Libraries/Renderer/shims/ReactNative');
  if (typeof shim.unstable_batchedUpdates !== 'function') {
    shim.unstable_batchedUpdates = (fn) => fn();
  }
} catch (e) {}

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-cookies/cookies', () => ({
  get: jest.fn(() => Promise.resolve({})),
  set: jest.fn(() => Promise.resolve(true)),
  clearAll: jest.fn(() => Promise.resolve(true)),
  flush: jest.fn(() => Promise.resolve(true)),
  removeSessionCookies: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  })),
}));

jest.mock('react-native-file-access', () => ({
  Dirs: {
    CacheDir: '/cache',
    DocumentDir: '/docs',
    SDCardDir: '/sdcard',
  },
  FileSystem: {
    exists: jest.fn(() => Promise.resolve(false)),
    readFile: jest.fn(() => Promise.resolve('')),
    writeFile: jest.fn(() => Promise.resolve()),
    unlink: jest.fn(() => Promise.resolve()),
    mkdir: jest.fn(() => Promise.resolve()),
    cp: jest.fn(() => Promise.resolve()),
    ls: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({ size: 0 })),
  },
}));

jest.mock('@georstat/react-native-image-cache', () => ({
  CachedImage: 'CachedImage',
  CacheManager: {
    config: {},
    defaultConfig: { baseDir: '/cache/images_cache/' },
    prefetch: jest.fn(),
    prefetchBlob: jest.fn(() => Promise.resolve(undefined)),
    removeCacheEntry: jest.fn(() => Promise.resolve()),
    clearCache: jest.fn(() => Promise.resolve()),
    get: jest.fn(),
  },
}));

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn(() => Promise.resolve()),
  init: jest.fn(),
}));

jest.mock('react-native-share', () => ({
  default: { open: jest.fn(() => Promise.resolve({})) },
}));

jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: { save: jest.fn(() => Promise.resolve('')) },
}));

jest.mock('react-native-document-picker', () => ({
  default: { pickSingle: jest.fn() },
}));

jest.mock('react-native-canvas', () => ({
  default: 'Canvas',
  Image: jest.fn(),
}));
