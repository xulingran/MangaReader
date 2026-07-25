import React, {
  memo,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  type Ref,
} from 'react';
import {
  getDefaultFillMedianHeight,
  LayoutMode,
  PositionX,
  MultipleSeat,
  SafeArea,
  Orientation,
  AsyncStatus,
  resolveDragTargetIndex,
  DRAG_PAGE_THRESHOLD_RATIO,
} from '~/utils';
import { FlashList, ListRenderItemInfo, ViewToken } from '@shopify/flash-list';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDebouncedSafeAreaFrame } from '~/hooks';
import { useFocusEffect } from '@react-navigation/native';
import { Box, Flex } from 'native-base';
import Controller, { LongPressController } from '~/components/Controller';
import ComicImage, { ImageState } from '~/components/ComicImage';
import Cache from '~/utils/cache';

/**
 * 保留一个很小的离屏绘制缓冲。横向页占满整个视口，只要越过边界少量像素，
 * RecyclerListView 就会保留前后相邻页；无需把完整屏宽都作为 render-ahead。
 */
const READER_DRAW_DISTANCE = 64;
const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
const imageKeyExtractor = (item: { chapterHash: string; current: number }) =>
  `${item.chapterHash}:${item.current}`;
// 多页项的稳定 key：用 `chapterHash:current` 拼接后再 join，避免 JSON.stringify 在
// FlashList 滚动/布局阶段高频调用时产生的数组分配与字符串转义开销。
const multipleKeyExtractor = (items: { chapterHash: string; current: number }[]) =>
  items.map(({ chapterHash, current }) => `${chapterHash}:${current}`).join('|');
export const reportFulfilledImage = (
  state: ImageState,
  onImageLoad: ReaderProps['onImageLoad'],
  uri: string,
  chapterHash: string,
  current: number
) => {
  if (state.loadStatus === AsyncStatus.Fulfilled) {
    onImageLoad?.(uri, chapterHash, current);
  }
};
/** 双页组换算全局页码 */
const multiplePageOf = (items: { pre: number; current: number }[]) =>
  items[0].pre + items[0].current - 1;
const VerticalListHeader = () => <Box height={0} safeAreaTop />;
const VerticalListFooter = () => <Box height={0} safeAreaBottom />;

export interface ReaderProps {
  initPage?: number;
  inverted?: boolean;
  seat?: MultipleSeat;
  layoutMode?: LayoutMode;
  data?: {
    uri: string;
    needUnscramble?: boolean | undefined;
    pre: number;
    current: number;
    chapterHash: string;
  }[];
  headers?: Chapter['headers'];
  onTap?: (position: PositionX) => void;
  onLongPress?: (position: PositionX, source?: string) => void;
  onImageLoad?: (uri: string, hash: string, index: number) => void;
  onPageChange?: (page: number) => void;
  onLoadMore?: () => void;
  onZoomStart?: (scale: number) => void;
  onZoomEnd?: (scale: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: (event?: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (event?: NativeSyntheticEvent<NativeScrollEvent>) => void;
  cache: Cache;
  ref?: Ref<ReaderRef>;
}

/**
 * 电子墨水版：所有程序化定位均为瞬时（animated: false），不再接受动画参数
 */
export interface ReaderRef {
  scrollToIndex: (index: number, notifyPageChange?: boolean) => void;
  clearStateRef: () => void;
}

const EMPTY_LIST: Required<ReaderProps>['data'] = [];
const EMPTY_HEADERS: NonNullable<ReaderProps['headers']> = {};

const useTakeTwo = (data: Required<ReaderProps>['data'], seat: MultipleSeat) => {
  return useMemo(() => {
    const list: Required<ReaderProps>['data']['0'][][] = [];

    for (let i = 0; i < data.length; ) {
      const batch = data.slice(i, i + 2).reduce<typeof data>((dict, item) => {
        if (dict.length <= 0) {
          dict.push(item);
        } else if (dict[0].chapterHash === item.chapterHash) {
          dict.push(item);
        }
        return dict;
      }, []);

      list.push(seat === MultipleSeat.AToB ? batch : batch.reverse());
      i += batch.length;
    }

    return list;
  }, [data, seat]);
};

const Reader = ({
  ref,
  initPage = 0,
  inverted = false,
  seat = MultipleSeat.AToB,
  layoutMode = LayoutMode.Horizontal,
  data = EMPTY_LIST,
  headers = EMPTY_HEADERS,
  onTap,
  onLongPress,
  onImageLoad,
  onPageChange,
  onLoadMore,
  onZoomStart,
  onZoomEnd,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  cache,
}: ReaderProps) => {
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const multipleData = useTakeTwo(data, seat);
  // 同一个 ref 在三种布局间复用：横向/纵向是单图项，双页是图项数组。
  // FlashList 的泛型只影响 renderItem 的类型推断，scrollToIndex 与泛型无关，
  // 这里用 any 与原始实现保持一致，避免三种 item 类型互不兼容导致的赋值冲突。
  const flashListRef = useRef<FlashList<any>>(null);
  const horizontalStateRef = useRef<(ImageState | null)[]>([]);
  const verticalStateRef = useRef<(ImageState | null)[]>([]);
  const multipleStateRef = useRef<Record<string, ImageState | null>[]>([]);
  const handleAccessibilityNext = useCallback(
    () => onTap?.(inverted ? PositionX.Left : PositionX.Right),
    [inverted, onTap]
  );
  const handleAccessibilityPrevious = useCallback(
    () => onTap?.(inverted ? PositionX.Right : PositionX.Left),
    [inverted, onTap]
  );
  const estimatedListSize = useMemo(
    () => ({ width: windowWidth, height: windowHeight }),
    [windowWidth, windowHeight]
  );

  const currentIndexRef = useRef(0);

  const portraitHeight = (Math.max(windowWidth, windowHeight) * 3) / 5;
  const landscapeHeight = (Math.min(windowWidth, windowHeight) * 3) / 5;
  const defaultPortraitHeightRef = useRef(portraitHeight);
  const defaultLandscapeHeightRef = useRef(landscapeHeight);

  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const initialScrollIndex = useMemo(() => {
    if (layoutMode !== LayoutMode.Multiple) {
      return Math.max(Math.min(initPage, data.length - 1), 0);
    }
    const target = data[Math.max(Math.min(initPage, data.length - 1), 0)];
    const groupIndex = target ? multipleData.findIndex((group) => group.includes(target)) : -1;
    return Math.max(groupIndex, 0);
  }, [initPage, data, multipleData, layoutMode]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        horizontalStateRef.current = [];
        verticalStateRef.current = [];
        multipleStateRef.current = [];
      };
    }, [])
  );

  /** 将列表 index 换算成全局页码并上报 */
  const reportPage = useCallback(
    (index: number) => {
      if (!onPageChangeRef.current) {
        return;
      }
      if (layoutMode === LayoutMode.Multiple) {
        const pair = multipleData[index];
        if (pair && pair.length > 0) {
          onPageChangeRef.current(multiplePageOf(pair));
        }
      } else {
        onPageChangeRef.current(index);
      }
    },
    [layoutMode, multipleData]
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, notifyPageChange = true) => {
      const maxIndex = (layoutMode === LayoutMode.Multiple ? multipleData.length : data.length) - 1;
      const target = Math.max(Math.min(index, Math.max(maxIndex, 0)), 0);
      currentIndexRef.current = target;
      flashListRef.current?.scrollToIndex({ index: target, animated: false });
      // FlashList 对无动画的命令式定位不保证触发 viewability 回调。
      // 实体键、定时翻页和跳页都依赖这里同步页码，否则连续操作会基于旧页，进度也不会落盘。
      if (notifyPageChange) {
        reportPage(target);
      }
    },
    clearStateRef: () => {
      horizontalStateRef.current = [];
      verticalStateRef.current = [];
      multipleStateRef.current = [];
    },
  }));

  /**
   * 横向滑动结束决策：内容不再跟随手指（FlashList scrollEnabled=false），
   * 松手时按手势位移与方向确定目标页（最多一页），scrollToIndex(animated: false) 瞬时切换
   */
  const settleSwipe = useCallback(
    (translationX: number) => {
      if (layoutMode === LayoutMode.Vertical) {
        return;
      }
      // inverted 列表视觉翻转，手指方向与页码方向同向；
      // 归一化为等效 offset 语义：正位移 = 下一页
      const deltaX = inverted ? translationX : -translationX;

      const maxIndex = (layoutMode === LayoutMode.Multiple ? multipleData.length : data.length) - 1;
      const target = resolveDragTargetIndex({
        deltaX,
        currentIndex: currentIndexRef.current,
        maxIndex,
        threshold: windowWidth * DRAG_PAGE_THRESHOLD_RATIO,
      });

      currentIndexRef.current = target;
      flashListRef.current?.scrollToIndex({ index: target, animated: false });
      reportPage(target);
    },
    [layoutMode, inverted, multipleData.length, data.length, windowWidth, reportPage]
  );

  /** 滑动开始：透传给父级（暂停定时翻页） */
  const handleSwipeStart = useCallback(() => {
    onScrollBeginDrag && onScrollBeginDrag();
  }, [onScrollBeginDrag]);
  /** 滑动结束：瞬时切页并透传给父级（恢复定时翻页） */
  const handleSwipe = useCallback(
    (translationX: number) => {
      settleSwipe(translationX);
      onScrollEndDrag && onScrollEndDrag();
    },
    [settleSwipe, onScrollEndDrag]
  );

  const extraData = useMemo(
    () => ({
      inverted,
      onTap,
      onLongPress,
      onImageLoad,
      onSwipeStart: handleSwipeStart,
      onSwipe: handleSwipe,
    }),
    [inverted, onTap, onLongPress, onImageLoad, handleSwipeStart, handleSwipe]
  );

  // https://github.com/Shopify/flash-list/issues/637
  // onViewableItemsChanged is bound in constructor and do not get updated when those props change
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length <= 0) {
        return;
      }

      const last = viewableItems[viewableItems.length - 1];
      currentIndexRef.current = last.index ?? 0;
      onPageChangeRef.current && onPageChangeRef.current(last.index ?? 0);
    },
    []
  );
  const handleMultipleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length <= 0) {
        return;
      }

      const last = viewableItems[viewableItems.length - 1];
      currentIndexRef.current = last.index ?? 0;
      onPageChangeRef.current && onPageChangeRef.current(multiplePageOf(last.item));
    },
    []
  );
  const renderHorizontalItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof data)[0]>) => {
      const { uri, needUnscramble } = item;
      const horizontalState = horizontalStateRef.current[index] || undefined;
      return (
        <Controller
          horizontal
          onTap={onTap}
          onLongPress={(position) => onLongPress && onLongPress(position, horizontalState?.dataUrl)}
          onZoomStart={onZoomStart}
          onZoomEnd={onZoomEnd}
          onAccessibilityNext={handleAccessibilityNext}
          onAccessibilityPrevious={handleAccessibilityPrevious}
          onSwipeStart={handleSwipeStart}
          onSwipe={handleSwipe}
          safeAreaType={SafeArea.All}
        >
          <ComicImage
            uri={uri}
            index={index}
            needUnscramble={needUnscramble}
            headers={headers}
            prevState={horizontalState}
            defaultPortraitHeight={defaultPortraitHeightRef.current}
            defaultLandscapeHeight={defaultLandscapeHeightRef.current}
            layoutMode={LayoutMode.Horizontal}
            onRelease={(idx = index) => {
              horizontalStateRef.current[idx] = null;
            }}
            onChange={(state, idx = index) => {
              horizontalStateRef.current[idx] = state;
              reportFulfilledImage(state, onImageLoad, uri, item.chapterHash, item.current);
            }}
          />
        </Controller>
      );
    },
    [
      handleAccessibilityNext,
      handleAccessibilityPrevious,
      handleSwipe,
      handleSwipeStart,
      headers,
      onImageLoad,
      onLongPress,
      onTap,
      onZoomEnd,
      onZoomStart,
    ]
  );
  const renderVerticalItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof data)[0]>) => {
      const { uri, needUnscramble } = item;
      const verticalState = verticalStateRef.current[index] || undefined;
      const cacheState = cache.getImageState(uri);
      return (
        <Box
          overflow="hidden"
          style={{
            height:
              orientation === Orientation.Portrait
                ? verticalState?.portraitHeight ||
                  cacheState?.portraitHeight ||
                  defaultPortraitHeightRef.current
                : verticalState?.landscapeHeight ||
                  cacheState?.landscapeHeight ||
                  defaultLandscapeHeightRef.current,
          }}
        >
          <Controller
            onTap={onTap}
            onLongPress={(position) => onLongPress && onLongPress(position, verticalState?.dataUrl)}
            onZoomStart={onZoomStart}
            onZoomEnd={onZoomEnd}
            onAccessibilityNext={handleAccessibilityNext}
            onAccessibilityPrevious={handleAccessibilityPrevious}
            safeAreaType={SafeArea.X}
          >
            <ComicImage
              uri={uri}
              index={index}
              needUnscramble={needUnscramble}
              headers={headers}
              prevState={verticalState}
              defaultPortraitHeight={defaultPortraitHeightRef.current}
              defaultLandscapeHeight={defaultLandscapeHeightRef.current}
              layoutMode={LayoutMode.Vertical}
              onRelease={(idx = index) => {
                verticalStateRef.current[idx] = null;
              }}
              onChange={(state, idx = index) => {
                cache.setImageState(uri, state);
                verticalStateRef.current[idx] = state;
                reportFulfilledImage(state, onImageLoad, uri, item.chapterHash, item.current);

                const defaultHeight = getDefaultFillMedianHeight(
                  verticalStateRef.current.filter(
                    (imageState): imageState is ImageState => imageState !== null
                  ),
                  { portrait: portraitHeight, landscape: landscapeHeight }
                );
                defaultPortraitHeightRef.current = defaultHeight.portrait;
                defaultLandscapeHeightRef.current = defaultHeight.landscape;
              }}
            />
          </Controller>
        </Box>
      );
    },
    [
      cache,
      handleAccessibilityNext,
      handleAccessibilityPrevious,
      headers,
      landscapeHeight,
      onImageLoad,
      onLongPress,
      onTap,
      onZoomEnd,
      onZoomStart,
      orientation,
      portraitHeight,
    ]
  );
  const renderMultipleItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof multipleData)[0]>) => {
      return (
        <Controller
          horizontal
          safeAreaType={SafeArea.All}
          onTap={onTap}
          onZoomStart={onZoomStart}
          onZoomEnd={onZoomEnd}
          onAccessibilityNext={handleAccessibilityNext}
          onAccessibilityPrevious={handleAccessibilityPrevious}
          onSwipeStart={handleSwipeStart}
          onSwipe={handleSwipe}
        >
          <Flex w="full" h="full" flexDirection="row" alignItems="center" justifyContent="center">
            {item.map(({ uri, needUnscramble, chapterHash, current }) => {
              const imageKey = `${chapterHash}:${current}`;
              const multipleState = (multipleStateRef.current[index] || [])[imageKey] || undefined;
              return (
                <Box key={imageKey}>
                  <LongPressController
                    onLongPress={() =>
                      onLongPress && onLongPress(PositionX.Mid, multipleState?.dataUrl)
                    }
                  >
                    <ComicImage
                      uri={uri}
                      index={index}
                      needUnscramble={needUnscramble}
                      headers={headers}
                      prevState={multipleState}
                      defaultPortraitHeight={defaultPortraitHeightRef.current}
                      defaultLandscapeHeight={defaultLandscapeHeightRef.current}
                      layoutMode={LayoutMode.Multiple}
                      onRelease={(idx = index) => {
                        if (multipleStateRef.current[idx]) {
                          multipleStateRef.current[idx][imageKey] = null;
                        }
                      }}
                      onChange={(state, idx = index) => {
                        if (typeof multipleStateRef.current[idx] !== 'object') {
                          multipleStateRef.current[idx] = {};
                        }
                        multipleStateRef.current[idx][imageKey] = state;
                        reportFulfilledImage(state, onImageLoad, uri, chapterHash, current);
                      }}
                    />
                  </LongPressController>
                </Box>
              );
            })}
          </Flex>
        </Controller>
      );
    },
    [
      handleAccessibilityNext,
      handleAccessibilityPrevious,
      handleSwipe,
      handleSwipeStart,
      headers,
      onImageLoad,
      onLongPress,
      onTap,
      onZoomEnd,
      onZoomStart,
    ]
  );
  const overrideItemLayout = useCallback(
    (layout: { size?: number }, item: (typeof data)[0]) => {
      const state = cache.getImageState(item.uri);
      if (state) {
        layout.size =
          orientation === Orientation.Portrait ? state.portraitHeight : state.landscapeHeight;
      }
    },
    [cache, orientation]
  );

  if (layoutMode === LayoutMode.Multiple) {
    return (
      <FlashList
        key="multiple"
        ref={flashListRef}
        data={multipleData}
        inverted={inverted}
        horizontal
        scrollEnabled={false}
        extraData={extraData}
        viewabilityConfig={viewabilityConfig}
        drawDistance={READER_DRAW_DISTANCE}
        initialScrollIndex={initialScrollIndex}
        estimatedItemSize={windowWidth}
        estimatedListSize={estimatedListSize}
        onScroll={onScroll}
        onEndReached={onLoadMore}
        onEndReachedThreshold={3}
        onViewableItemsChanged={handleMultipleViewableItemsChanged}
        renderItem={renderMultipleItem}
        keyExtractor={multipleKeyExtractor}
      />
    );
  }

  if (layoutMode === LayoutMode.Horizontal) {
    return (
      <FlashList
        key="horizontal"
        ref={flashListRef}
        data={data}
        inverted={inverted}
        horizontal
        scrollEnabled={false}
        extraData={extraData}
        viewabilityConfig={viewabilityConfig}
        drawDistance={READER_DRAW_DISTANCE}
        initialScrollIndex={initialScrollIndex}
        estimatedItemSize={windowWidth}
        estimatedListSize={estimatedListSize}
        onScroll={onScroll}
        onEndReached={onLoadMore}
        onEndReachedThreshold={5}
        onViewableItemsChanged={handleViewableItemsChanged}
        renderItem={renderHorizontalItem}
        keyExtractor={imageKeyExtractor}
      />
    );
  }

  return (
    <FlashList
      key="vertical"
      ref={flashListRef}
      data={data}
      inverted={inverted}
      extraData={extraData}
      drawDistance={READER_DRAW_DISTANCE}
      initialScrollIndex={initialScrollIndex}
      estimatedItemSize={(windowHeight * 3) / 5}
      estimatedListSize={estimatedListSize}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onEndReached={onLoadMore}
      onEndReachedThreshold={5}
      onViewableItemsChanged={handleViewableItemsChanged}
      renderItem={renderVerticalItem}
      keyExtractor={imageKeyExtractor}
      ListHeaderComponent={VerticalListHeader}
      ListFooterComponent={VerticalListFooter}
      overrideItemLayout={overrideItemLayout}
    />
  );
};

const areReaderPropsEqual = (previous: ReaderProps, next: ReaderProps) =>
  previous.inverted === next.inverted &&
  previous.seat === next.seat &&
  previous.layoutMode === next.layoutMode &&
  previous.data === next.data &&
  previous.headers === next.headers &&
  previous.onTap === next.onTap &&
  previous.onLongPress === next.onLongPress &&
  previous.onImageLoad === next.onImageLoad &&
  previous.onPageChange === next.onPageChange &&
  previous.onLoadMore === next.onLoadMore &&
  previous.onZoomStart === next.onZoomStart &&
  previous.onZoomEnd === next.onZoomEnd &&
  previous.onScroll === next.onScroll &&
  previous.onScrollBeginDrag === next.onScrollBeginDrag &&
  previous.onScrollEndDrag === next.onScrollEndDrag &&
  previous.cache === next.cache;

// initPage 只在挂载时生效；翻页后忽略它，避免父页面进度更新让可见图片重新渲染。
export default memo(Reader, areReaderPropsEqual);
