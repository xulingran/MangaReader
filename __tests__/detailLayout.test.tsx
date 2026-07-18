import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { Metrics } from 'react-native-safe-area-context';
import Drawer, { DRAWER_TRIGGER_WIDTH } from '~/components/Drawer';
import { splitWidth } from '~/hooks/useSplitWidth';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  return {
    Box: (props: object) => mockReact.createElement(View, props),
    Pressable: (props: object) => mockReact.createElement(View, props),
    Text,
  };
});

jest.mock('~/hooks', () => ({
  useDebouncedSafeAreaFrame: () => ({ width: 632, height: 840 }),
  useDebouncedSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 632, height: 840 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('漫画详情布局', () => {
  it('目录网格为下载列表触发栏预留宽度', () => {
    expect(DRAWER_TRIGGER_WIDTH).toBe(12);
    const split = splitWidth({ ...metrics.frame, fontScale: 1, scale: 1 }, metrics.insets, {
      gap: 12,
      width: 0,
      reservedWidth: DRAWER_TRIGGER_WIDTH,
      minNumColumns: 3,
      maxSplitWidth: 100,
    });

    const occupiedWidth = split.itemWidth * split.numColumns + 12 * (split.numColumns + 1);
    expect(occupiedWidth).toBe(632 - DRAWER_TRIGGER_WIDTH);
  });

  it('收起的下载列表触发栏保留向左展开提示', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Drawer triggerLabel="下载列表" />);
    });

    expect(tree!.root.findByProps({ accessibilityLabel: '打开下载列表' })).toBeTruthy();
    expect(tree!.root.findByProps({ children: '‹' })).toBeTruthy();
    act(() => tree!.unmount());
  });
});
