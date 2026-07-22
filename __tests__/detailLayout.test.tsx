import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { Metrics } from 'react-native-safe-area-context';
import Drawer, { DrawerRef } from '~/components/Drawer';
import { splitWidth } from '~/hooks/useSplitWidth';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { Text, View: MockView } = require('react-native');
  return {
    Box: (props: object) => mockReact.createElement(MockView, props),
    Pressable: (props: object) => mockReact.createElement(MockView, props),
    Text,
  };
});

jest.mock('~/hooks', () => ({
  useDebouncedSafeAreaFrame: () => ({ width: 632, height: 840 }),
  useDebouncedSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 632, height: 840 },
  insets: { top: 0, left: 8, right: 12, bottom: 0 },
};

describe('漫画详情布局', () => {
  it('目录网格占满扣除左右安全区后的宽度', () => {
    const split = splitWidth({ ...metrics.frame, fontScale: 1, scale: 1 }, metrics.insets, {
      gap: 12,
      width: 0,
      reservedWidth: 0,
      minNumColumns: 3,
      maxSplitWidth: 100,
    });

    const occupiedWidth = split.itemWidth * split.numColumns + 12 * (split.numColumns + 1);
    expect(occupiedWidth).toBe(632 - metrics.insets.left - metrics.insets.right);
  });

  it('抽屉收起时不渲染右缘触发区，只能通过 ref 打开', () => {
    const drawerRef = React.createRef<DrawerRef>();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Drawer ref={drawerRef}>
          <View testID="download-tasks" />
        </Drawer>
      );
    });

    expect(tree!.toJSON()).toBeNull();

    act(() => drawerRef.current?.open());
    expect(tree!.root.findByProps({ accessibilityLabel: '关闭任务抽屉' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'download-tasks' })).toBeTruthy();

    act(() => {
      tree!.root.findByProps({ accessibilityLabel: '关闭任务抽屉' }).props.onPress();
    });
    expect(tree!.toJSON()).toBeNull();
    act(() => tree!.unmount());
  });
});
