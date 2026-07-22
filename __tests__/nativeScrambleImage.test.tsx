import { afterEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FileSystem } from 'react-native-file-access';
import { AsyncStatus } from '~/utils';
import NativeScrambleImage from '~/components/NativeScrambleImage';

jest.mock('native-base', () => {
  const { Text, View } = require('react-native');
  return {
    Box: View,
    Center: View,
    Icon: View,
    IconButton: View,
    Text,
    extendTheme: (theme: unknown) => theme,
  };
});

jest.mock('~/hooks', () => ({
  useDebouncedSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useDebouncedSafeAreaFrame: () => ({ width: 800, height: 1200, orientation: 'portrait' }),
}));

jest.mock('~/utils/imageProcessor', () => {
  const { FileSystem: MockFileSystem } = require('react-native-file-access');
  return {
    IMAGE_PROCESSOR_OUTPUT_DIR: '/cache/unscramble',
    ImageProcessor: {
      unscramble: jest.fn(() =>
        Promise.resolve({ path: '/cache/unscramble/test.png', width: 800, height: 1200 })
      ),
      cancel: jest.fn(),
    },
    unlinkTemporaryImage: (path: string) => MockFileSystem.unlink(path),
  };
});

describe('NativeScrambleImage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('临时文件无法被 Image 解码时释放文件并进入可重试状态', async () => {
    const onChange = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NativeScrambleImage
          uri="https://example.com/scrambled.jpg"
          index={0}
          defaultPortraitHeight={1200}
          defaultLandscapeHeight={800}
          onChange={onChange}
        />
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    const image = tree!.root.findByType(Image);
    expect(onChange).not.toHaveBeenCalled();
    act(() => image.props.onError());

    expect(FileSystem.unlink).toHaveBeenCalledWith('/cache/unscramble/test.png');
    expect(onChange).toHaveBeenLastCalledWith({ dataUrl: '', loadStatus: AsyncStatus.Rejected }, 0);
    expect(tree!.root.findByProps({ accessibilityLabel: '重新加载' })).toBeTruthy();

    act(() => tree!.unmount());
  });

  it('只有 Image 真正完成解码后才上报 Fulfilled', async () => {
    const onChange = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NativeScrambleImage
          uri="https://example.com/scrambled.jpg"
          index={1}
          defaultPortraitHeight={1200}
          defaultLandscapeHeight={800}
          onChange={onChange}
        />
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    });

    const image = tree!.root.findByType(Image);
    expect(onChange).not.toHaveBeenCalled();
    act(() => image.props.onLoad());

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: 'file:///cache/unscramble/test.png',
        loadStatus: AsyncStatus.Fulfilled,
      }),
      1
    );

    act(() => tree!.unmount());
  });
});
