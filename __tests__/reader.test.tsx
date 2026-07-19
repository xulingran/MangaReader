/**
 * 阅读器无惯性拖拽翻页回归测试（电子墨水版）
 */
import { it, expect, describe, beforeEach, afterEach, jest } from '@jest/globals';
import React from 'react';
import { Dimensions } from 'react-native';

// Note: test renderer must be required after react-native.
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider, Metrics } from 'react-native-safe-area-context';
import Reader, { ReaderRef } from '~/components/Reader';
import {
  resolveDragTargetIndex,
  DRAG_PAGE_THRESHOLD_RATIO,
  getReaderPrefetchUris,
} from '~/utils';

const windowWidth = Dimensions.get('window').width;
const threshold = windowWidth * DRAG_PAGE_THRESHOLD_RATIO;
const mockStore = globalThis as any;
const renderedReaders: renderer.ReactTestRenderer[] = [];

const initialMetrics: Metrics = {
  frame: { x: 0, y: 0, width: windowWidth, height: windowWidth * 2 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

jest.mock('@react-navigation/native', () => ({
  ...(jest.requireActual('@react-navigation/native') as object),
  useFocusEffect: jest.fn(),
}));

/** mock FlashList：捕获 props 与 scrollToIndex/scrollToOffset 调用 */
jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  const FlashList = mockReact.forwardRef((props: any, ref: any) => {
    mockStore.__flashListRenderCount += 1;
    mockStore.__flashListProps = props;
    mockReact.useImperativeHandle(ref, () => ({
      scrollToIndex: (args: any) => {
        mockStore.__scrollToIndexCalls.push(args);
      },
      scrollToOffset: (args: any) => {
        mockStore.__scrollToOffsetCalls.push(args);
      },
    }));
    return null;
  });
  return { FlashList };
});

const mockCache = {
  getImageState: () => undefined,
  setImageState: () => {},
} as any;

const makeData = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    uri: `https://example.com/${i}.jpg`,
    pre: 0,
    current: i + 1,
    chapterHash: 'chapter#1',
  }));

const renderReader = (ref: React.RefObject<ReaderRef | null>, data = makeData(5), initPage = 0) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <Reader ref={ref} data={data} initPage={initPage} cache={mockCache} />
      </SafeAreaProvider>
    );
  });
  renderedReaders.push(tree!);
  return tree!;
};

describe('resolveDragTargetIndex 纯函数', () => {
  const t = 100;

  it('短距离拖动回到当前页', () => {
    expect(resolveDragTargetIndex({ deltaX: 50, currentIndex: 2, maxIndex: 4, threshold: t })).toBe(
      2
    );
    expect(
      resolveDragTargetIndex({ deltaX: -99, currentIndex: 2, maxIndex: 4, threshold: t })
    ).toBe(2);
  });

  it('超过阈值正向拖动进入下一页', () => {
    expect(
      resolveDragTargetIndex({ deltaX: 100, currentIndex: 2, maxIndex: 4, threshold: t })
    ).toBe(3);
  });

  it('超过阈值反向拖动进入上一页', () => {
    expect(
      resolveDragTargetIndex({ deltaX: -100, currentIndex: 2, maxIndex: 4, threshold: t })
    ).toBe(1);
  });

  it('快速拖动（任意距离）最多移动一页，无惯性连翻', () => {
    expect(
      resolveDragTargetIndex({ deltaX: 10000, currentIndex: 2, maxIndex: 4, threshold: t })
    ).toBe(3);
    expect(
      resolveDragTargetIndex({ deltaX: -10000, currentIndex: 2, maxIndex: 4, threshold: t })
    ).toBe(1);
  });

  it('边界 clamp：第一页向前、最后一页向后不越界', () => {
    expect(
      resolveDragTargetIndex({ deltaX: -500, currentIndex: 0, maxIndex: 4, threshold: t })
    ).toBe(0);
    expect(
      resolveDragTargetIndex({ deltaX: 500, currentIndex: 4, maxIndex: 4, threshold: t })
    ).toBe(4);
  });
});

describe('getReaderPrefetchUris 预取窗口', () => {
  it('优先保留前后相邻页，并额外预取后一页', () => {
    const data = makeData(6);

    expect(getReaderPrefetchUris(data, 2)).toEqual([
      'https://example.com/3.jpg',
      'https://example.com/1.jpg',
      'https://example.com/4.jpg',
    ]);
  });

  it('在边界内过滤解密图和 base64 图', () => {
    const data = [
      ...makeData(3),
      { ...makeData(1)[0], uri: 'https://example.com/3.jpg', needUnscramble: true },
      { ...makeData(1)[0], uri: 'https://example.com/4.jpg', isBase64Image: true },
    ];

    expect(getReaderPrefetchUris(data, 0)).toEqual([
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
    ]);
    expect(getReaderPrefetchUris(data, 2)).toEqual(['https://example.com/1.jpg']);
  });
});

describe('Reader 组件', () => {
  beforeEach(() => {
    mockStore.__scrollToIndexCalls = [];
    mockStore.__scrollToOffsetCalls = [];
    mockStore.__flashListProps = undefined;
    mockStore.__flashListRenderCount = 0;
  });

  afterEach(() => {
    act(() => renderedReaders.splice(0).forEach((tree) => tree.unmount()));
  });

  it('scrollToIndex / scrollToOffset 固定无动画（animated: false）', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    ref.current?.scrollToIndex(3);
    ref.current?.scrollToOffset(120);

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 3, animated: false }]);
    expect(mockStore.__scrollToOffsetCalls).toEqual([{ offset: 120, animated: false }]);
  });

  it('横向模式无惯性，并保留小幅离屏绘制距离用于相邻页预加载', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);
    expect(mockStore.__flashListProps.pagingEnabled).toBeUndefined();
    expect(mockStore.__flashListProps.horizontal).toBe(true);
    expect(mockStore.__flashListProps.drawDistance).toBe(64);
  });

  it('父页面仅更新 initPage 时不重渲染图片列表', () => {
    const ref = React.createRef<ReaderRef>();
    const data = makeData(5);
    const tree = renderReader(ref, data, 0);

    act(() => {
      tree.update(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <Reader ref={ref} data={data} initPage={3} cache={mockCache} />
        </SafeAreaProvider>
      );
    });

    expect(mockStore.__flashListRenderCount).toBe(1);
  });

  it('短距离拖拽松手瞬时回当前页（animated: false）', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    mockStore.__flashListProps.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 0 } } });
    mockStore.__flashListProps.onScrollEndDrag({
      nativeEvent: { contentOffset: { x: threshold * 0.5 } },
    });

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 0, animated: false }]);
  });

  it('超过阈值拖拽松手瞬时进入相邻页', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    mockStore.__flashListProps.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 0 } } });
    mockStore.__flashListProps.onScrollEndDrag({
      nativeEvent: { contentOffset: { x: threshold * 2 } },
    });

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('快速拖拽（大 delta）最多移动一页', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    mockStore.__flashListProps.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 0 } } });
    mockStore.__flashListProps.onScrollEndDrag({ nativeEvent: { contentOffset: { x: 99999 } } });

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('反向拖拽进入上一页且不越界', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    // 先定位到第 2 页（currentIndexRef 同步）
    ref.current?.scrollToIndex(2);
    mockStore.__scrollToIndexCalls = [];

    mockStore.__flashListProps.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 2000 } } });
    mockStore.__flashListProps.onScrollEndDrag({ nativeEvent: { contentOffset: { x: 0 } } });

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });
});
