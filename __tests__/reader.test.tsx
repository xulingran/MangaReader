/**
 * 阅读器无惯性滑动翻页回归测试（电子墨水版）
 */
import { it, expect, describe, beforeEach, afterEach, jest } from '@jest/globals';
import React from 'react';
import { Dimensions } from 'react-native';

// Note: test renderer must be required after react-native.
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider, Metrics } from 'react-native-safe-area-context';
import Reader, { ReaderProps, ReaderRef, reportFulfilledImage } from '~/components/Reader';
import {
  resolveDragTargetIndex,
  DRAG_PAGE_THRESHOLD_RATIO,
  getReaderPrefetchUris,
  AsyncStatus,
  LayoutMode,
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

/** mock FlashList：捕获 props 与 scrollToIndex 调用 */
jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  const FlashList = mockReact.forwardRef((props: any, ref: any) => {
    mockStore.__flashListRenderCount += 1;
    mockStore.__flashListProps = props;
    mockReact.useImperativeHandle(ref, () => ({
      scrollToIndex: (args: any) => {
        mockStore.__scrollToIndexCalls.push(args);
      },
    }));
    // 横向/双页模式渲染首个 item，让 item 内的 Controller mock 能捕获到 Reader 传入的 swipe 回调；
    // 条漫模式 item 直接渲染 native-base Box（无 Provider），保持返回 null
    const firstItem = props.data && props.data[0];
    return props.horizontal && firstItem ? props.renderItem({ item: firstItem, index: 0 }) : null;
  });
  return { FlashList };
});

/** mock Controller：捕获 Reader 传给每页的 swipe 回调，不渲染图片内容 */
jest.mock('~/components/Controller', () => {
  const Controller = (props: any) => {
    mockStore.__controllerProps = props;
    return null;
  };
  return { __esModule: true, default: Controller, LongPressController: () => null };
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

const renderReader = (
  ref: React.RefObject<ReaderRef | null>,
  data = makeData(5),
  initPage = 0,
  onPageChange?: (page: number) => void,
  readerProps: Partial<ReaderProps> = {}
) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <Reader
          ref={ref}
          data={data}
          initPage={initPage}
          cache={mockCache}
          onPageChange={onPageChange}
          {...readerProps}
        />
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

  it('在边界内过滤扰乱图', () => {
    const data = [
      ...makeData(3),
      { ...makeData(1)[0], uri: 'https://example.com/3.jpg', needUnscramble: true },
    ];

    expect(getReaderPrefetchUris(data, 0)).toEqual([
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
    ]);
    expect(getReaderPrefetchUris(data, 2)).toEqual(['https://example.com/1.jpg']);
  });
});

describe('图片阅读进度', () => {
  it('只有成功解码并渲染的图片才计入阅读进度', () => {
    const onImageLoad = jest.fn();
    const identity = ['https://example.com/1.jpg', 'chapter#1', 1] as const;

    reportFulfilledImage(
      { dataUrl: '', loadStatus: AsyncStatus.Rejected },
      onImageLoad,
      ...identity
    );
    expect(onImageLoad).not.toHaveBeenCalled();

    reportFulfilledImage(
      { dataUrl: identity[0], loadStatus: AsyncStatus.Fulfilled },
      onImageLoad,
      ...identity
    );
    expect(onImageLoad).toHaveBeenCalledWith(...identity);
  });
});

describe('Reader 组件', () => {
  beforeEach(() => {
    mockStore.__scrollToIndexCalls = [];
    mockStore.__flashListProps = undefined;
    mockStore.__flashListRenderCount = 0;
    mockStore.__controllerProps = undefined;
  });

  afterEach(() => {
    act(() => renderedReaders.splice(0).forEach((tree) => tree.unmount()));
  });

  it('scrollToIndex 固定无动画（animated: false）', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    ref.current?.scrollToIndex(3);
    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 3, animated: false }]);
  });

  it('命令式翻页同步上报页码，避免实体键连续翻页和进度持久化使用旧页', () => {
    const ref = React.createRef<ReaderRef>();
    const onPageChange = jest.fn();
    renderReader(ref, makeData(5), 0, onPageChange);

    act(() => ref.current?.scrollToIndex(3));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('切换章节定位时可抑制旧 Reader 的页码回调', () => {
    const ref = React.createRef<ReaderRef>();
    const onPageChange = jest.fn();
    renderReader(ref, makeData(5), 0, onPageChange);

    act(() => ref.current?.scrollToIndex(0, false));

    expect(onPageChange).not.toHaveBeenCalled();
    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 0, animated: false }]);
  });

  it('横向模式无惯性，并保留小幅离屏绘制距离用于相邻页预加载', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);
    expect(mockStore.__flashListProps.pagingEnabled).toBeUndefined();
    expect(mockStore.__flashListProps.horizontal).toBe(true);
    expect(mockStore.__flashListProps.drawDistance).toBe(64);
  });

  it('重复图片 URI 仍使用章节和页码生成唯一列表 key', () => {
    const ref = React.createRef<ReaderRef>();
    const data = makeData(2).map((item) => ({ ...item, uri: 'https://example.com/same.jpg' }));
    renderReader(ref, data);

    expect(mockStore.__flashListProps.keyExtractor(data[0])).not.toBe(
      mockStore.__flashListProps.keyExtractor(data[1])
    );
  });

  it('双页模式跨越奇数页章节边界时定位到新章节所在分组', () => {
    const ref = React.createRef<ReaderRef>();
    const data = [
      ...makeData(3),
      ...makeData(2).map((item, index) => ({
        ...item,
        uri: `https://example.com/next-${index}.jpg`,
        current: index + 1,
        chapterHash: 'chapter#2',
      })),
    ];
    renderReader(ref, data, 3, undefined, { layoutMode: LayoutMode.Multiple });

    expect(mockStore.__flashListProps.initialScrollIndex).toBe(2);
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

  it('短距离滑动松手瞬时回当前页（animated: false）', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    act(() => mockStore.__controllerProps.onSwipe(-threshold * 0.5));

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 0, animated: false }]);
  });

  it('超过阈值左滑松手瞬时进入下一页', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    act(() => mockStore.__controllerProps.onSwipe(-threshold * 2));

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('快速滑动（大位移）最多移动一页', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    act(() => mockStore.__controllerProps.onSwipe(-99999));

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('右滑进入上一页且不越界', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref);

    // 先定位到第 2 页（currentIndexRef 同步）
    act(() => ref.current?.scrollToIndex(2));
    mockStore.__scrollToIndexCalls = [];

    act(() => mockStore.__controllerProps.onSwipe(threshold * 2));

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('反向阅读（inverted）时右滑进入下一页', () => {
    const ref = React.createRef<ReaderRef>();
    renderReader(ref, makeData(5), 0, undefined, { inverted: true });

    act(() => mockStore.__controllerProps.onSwipe(threshold * 2));

    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });

  it('横向/双页模式关闭触摸滚动，条漫模式保留原生滚动', () => {
    renderReader(React.createRef<ReaderRef>());
    expect(mockStore.__flashListProps.scrollEnabled).toBe(false);

    renderReader(React.createRef<ReaderRef>(), makeData(5), 0, undefined, {
      layoutMode: LayoutMode.Multiple,
    });
    expect(mockStore.__flashListProps.scrollEnabled).toBe(false);

    renderReader(React.createRef<ReaderRef>(), makeData(5), 0, undefined, {
      layoutMode: LayoutMode.Vertical,
    });
    expect(mockStore.__flashListProps.scrollEnabled).not.toBe(false);
  });

  it('滑动开始与结束透传父级回调（暂停/恢复定时翻页）', () => {
    const ref = React.createRef<ReaderRef>();
    const onScrollBeginDrag = jest.fn();
    const onScrollEndDrag = jest.fn();
    renderReader(ref, makeData(5), 0, undefined, { onScrollBeginDrag, onScrollEndDrag });

    act(() => mockStore.__controllerProps.onSwipeStart());
    expect(onScrollBeginDrag).toHaveBeenCalledTimes(1);

    act(() => mockStore.__controllerProps.onSwipe(-threshold * 2));
    expect(onScrollEndDrag).toHaveBeenCalledTimes(1);
    expect(mockStore.__scrollToIndexCalls).toEqual([{ index: 1, animated: false }]);
  });
});
