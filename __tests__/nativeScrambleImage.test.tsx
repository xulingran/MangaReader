import { afterEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FileSystem } from 'react-native-file-access';
import { AsyncStatus } from '~/utils';
import NativeScrambleImage from '~/components/NativeScrambleImage';

// 引用 mock 出来的尺寸 setter，模拟防抖后尺寸变化（旋转屏 / insets 变化）
const hooksMock = require('~/hooks') as {
  __setFrame: (next: { width: number; height: number; orientation: string }) => void;
  __setInsets: (next: { top: number; right: number; bottom: number; left: number }) => void;
};

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

jest.mock('~/hooks', () => {
  // 让尺寸可被测试动态修改，模拟旋转屏 / insets 防抖变化
  let frameState = { width: 800, height: 1200, orientation: 'portrait' };
  let insetsState = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    __setFrame: (next: typeof frameState) => {
      frameState = next;
    },
    __setInsets: (next: typeof insetsState) => {
      insetsState = next;
    },
    useDebouncedSafeAreaInsets: () => insetsState,
    useDebouncedSafeAreaFrame: () => frameState,
  };
});

jest.mock('~/utils/imageProcessor', () => {
  const { FileSystem: MockFileSystem } = require('react-native-file-access');
  return {
    IMAGE_PROCESSOR_OUTPUT_DIR: '/cache/unscramble',
    ImageProcessor: {
      unscramble: jest.fn(() =>
        Promise.resolve({ path: '/cache/unscramble/test.jpg', width: 800, height: 1200 })
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

    expect(FileSystem.unlink).toHaveBeenCalledWith('/cache/unscramble/test.jpg');
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
        dataUrl: 'file:///cache/unscramble/test.jpg',
        loadStatus: AsyncStatus.Fulfilled,
      }),
      1
    );

    act(() => tree!.unmount());
  });

  it('尺寸/insets 防抖变化不触发重新下载与解密（effect deps 收敛）', async () => {
    // ImageProcessor.unscramble 的调用次数应保持为 1，即使 frame/insets 改变
    const { ImageProcessor } = require('~/utils/imageProcessor');
    const unscrambleSpy = ImageProcessor.unscramble as jest.Mock;

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
    expect(unscrambleSpy).toHaveBeenCalledTimes(1);

    // 模拟旋转屏：frame 改变（宽高互换）
    hooksMock.__setFrame({ width: 1200, height: 800, orientation: 'landscape' });
    // 模拟 insets 防抖后变化
    hooksMock.__setInsets({ top: 24, right: 0, bottom: 48, left: 0 });

    await act(async () => {
      tree!.update(
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

    // 关键断言：尺寸变化不应触发第二次 unscramble（旧实现会重新下载+解密）
    expect(unscrambleSpy).toHaveBeenCalledTimes(1);

    act(() => tree!.unmount());
  });
});
