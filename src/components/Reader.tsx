import React, {
  memo,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
  ForwardRefRenderFunction,
} from 'react';
import {
  getDefaultFillMedianHeight,
  LayoutMode,
  PositionX,
  ScrambleType,
  MultipleSeat,
  SafeArea,
  Orientation,
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
const imageKeyExtractor = (item: { uri: string }) => item.uri;
const multipleKeyExtractor = (item: { uri: string }[]) => item.map(({ uri }) => uri).join('#');
const VerticalListHeader = () => <Box height={0} safeAreaTop />;
const VerticalListFooter = () => <Box height={0} safeAreaBottom />;

export interface ReaderProps {
  initPage?: number;
  inverted?: boolean;
  seat?: MultipleSeat;
  layoutMode?: LayoutMode;
  data?: {
    uri: string;
    scrambleType?: ScrambleType;
    needUnscramble?: boolean | undefined;
    pre: number;
    current: number;
    chapterHash: string;
    isBase64Image?: boolean;
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
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  cache: Cache;
}

/**
 * 电子墨水版：所有程序化定位均为瞬时（animated: false），不再接受动画参数
 */
export interface ReaderRef {
  scrollToIndex: (index: number) => void;
  scrollToOffset: (offset: number) => void;
  clearStateRef: () => void;
}

const useTakeTwo = (data: Required<ReaderProps>['data'], size = 2, seat: MultipleSeat) => {
  return useMemo(() => {
    const list: Required<ReaderProps>['data']['0'][][] = [];

    for (let i = 0; i < data.length; ) {
      const batch = data.slice(i, i + size).reduce<typeof data>((dict, item) => {
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
  }, [data, size, seat]);
};

const Reader: ForwardRefRenderFunction<ReaderRef, ReaderProps> = (
  {
    initPage = 0,
    inverted = false,
    seat = MultipleSeat.AToB,
    layoutMode = LayoutMode.Horizontal,
    data = [],
    headers = {},
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
  },
  ref
) => {
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const multipleData = useTakeTwo(data, 2, seat);
  const flashListRef = useRef<FlashList<any>>(null);
  const horizontalStateRef = useRef<(ImageState | null)[]>([]);
  const verticalStateRef = useRef<(ImageState | null)[]>([]);
  const multipleStateRef = useRef<Record<string, ImageState | null>[]>([]);
  const extraData = useMemo(
    () => ({ inverted, onTap, onLongPress, onImageLoad }),
    [inverted, onTap, onLongPress, onImageLoad]
  );
  const estimatedListSize = useMemo(
    () => ({ width: windowWidth, height: windowHeight }),
    [windowWidth, windowHeight]
  );

  // 横向模式拖拽定位：记录拖动起始 offset 与起始 index
  const dragStartXRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef(0);
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
    } else {
      return Math.max(Math.min(Math.ceil((initPage + 1) / 2) - 1, multipleData.length - 1), 0);
    }
  }, [initPage, data.length, multipleData, layoutMode]);

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
          onPageChangeRef.current(pair[0].pre + pair[0].current - 1);
        }
      } else {
        onPageChangeRef.current(index);
      }
    },
    [layoutMode, multipleData]
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      currentIndexRef.current = index;
      flashListRef.current?.scrollToIndex({ index, animated: false });
    },
    scrollToOffset: (offset: number) => {
      flashListRef.current?.scrollToOffset({ offset, animated: false });
    },
    clearStateRef: () => {
      horizontalStateRef.current = [];
      verticalStateRef.current = [];
      multipleStateRef.current = [];
    },
  }));

  /**
   * 横向拖拽结束决策：按拖动距离与方向确定目标页（最多一页），
   * 通过 scrollToIndex(animated: false) 瞬时对齐，并终止原生惯性
   */
  const settleHorizontalDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (layoutMode === LayoutMode.Vertical || dragStartXRef.current === null) {
        return;
      }
      const deltaX = event.nativeEvent.contentOffset.x - dragStartXRef.current;
      dragStartXRef.current = null;

      const maxIndex = (layoutMode === LayoutMode.Multiple ? multipleData.length : data.length) - 1;
      const target = resolveDragTargetIndex({
        deltaX,
        currentIndex: dragStartIndexRef.current,
        maxIndex,
        threshold: windowWidth * DRAG_PAGE_THRESHOLD_RATIO,
      });

      currentIndexRef.current = target;
      flashListRef.current?.scrollToIndex({ index: target, animated: false });
      reportPage(target);
    },
    [layoutMode, multipleData.length, data.length, windowWidth, reportPage]
  );

  const handleScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (layoutMode !== LayoutMode.Vertical) {
        dragStartXRef.current = event.nativeEvent.contentOffset.x;
        dragStartIndexRef.current = currentIndexRef.current;
      }
      onScrollBeginDrag && onScrollBeginDrag(event);
    },
    [layoutMode, onScrollBeginDrag]
  );
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleHorizontalDrag(event);
      onScrollEndDrag && onScrollEndDrag(event);
    },
    [settleHorizontalDrag, onScrollEndDrag]
  );

  // https://github.com/Shopify/flash-list/issues/637
  // onViewableItemsChanged is bound in constructor and do not get updated when those props change
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length <= 0) {
        return;
      }

      const last = viewableItems[viewableItems.length - 1];
      currentIndexRef.current = last.index || 0;
      onPageChangeRef.current && onPageChangeRef.current(last.index || 0);
    },
    []
  );
  const handleMultipleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length <= 0) {
        return;
      }

      const last = viewableItems[viewableItems.length - 1];
      currentIndexRef.current = last.index || 0;
      onPageChangeRef.current &&
        onPageChangeRef.current(last.item[0].pre + last.item[0].current - 1);
    },
    []
  );
  const renderHorizontalItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof data)[0]>) => {
      const { uri, scrambleType, needUnscramble, isBase64Image = false } = item;
      const horizontalState = horizontalStateRef.current[index] || undefined;
      return (
        <Controller
          horizontal
          onTap={onTap}
          onLongPress={(position) => onLongPress && onLongPress(position, horizontalState?.dataUrl)}
          onZoomStart={onZoomStart}
          onZoomEnd={onZoomEnd}
          safeAreaType={SafeArea.All}
        >
          <ComicImage
            uri={uri}
            index={index}
            scrambleType={scrambleType}
            needUnscramble={needUnscramble}
            isBase64Image={isBase64Image}
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
              onImageLoad && onImageLoad(uri, item.chapterHash, item.current);
            }}
          />
        </Controller>
      );
    },
    [headers, onImageLoad, onLongPress, onTap, onZoomEnd, onZoomStart]
  );
  const renderVerticalItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof data)[0]>) => {
      const { uri, scrambleType, needUnscramble, isBase64Image = false } = item;
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
            safeAreaType={SafeArea.X}
          >
            <ComicImage
              uri={uri}
              index={index}
              scrambleType={scrambleType}
              needUnscramble={needUnscramble}
              isBase64Image={isBase64Image}
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
                onImageLoad && onImageLoad(uri, item.chapterHash, item.current);

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
        >
          <Flex w="full" h="full" flexDirection="row" alignItems="center" justifyContent="center">
            {item.map(
              ({
                uri,
                scrambleType,
                needUnscramble,
                chapterHash,
                current,
                isBase64Image = false,
              }) => {
                const multipleState = (multipleStateRef.current[index] || [])[uri] || undefined;
                return (
                  <Box key={uri}>
                    <LongPressController
                      onLongPress={() =>
                        onLongPress && onLongPress(PositionX.Mid, multipleState?.dataUrl)
                      }
                    >
                      <ComicImage
                        uri={uri}
                        index={index}
                        scrambleType={scrambleType}
                        needUnscramble={needUnscramble}
                        isBase64Image={isBase64Image}
                        headers={headers}
                        prevState={multipleState}
                        defaultPortraitHeight={defaultPortraitHeightRef.current}
                        defaultLandscapeHeight={defaultLandscapeHeightRef.current}
                        layoutMode={LayoutMode.Multiple}
                        onRelease={(idx = index) => {
                          if (multipleStateRef.current[idx]) {
                            multipleStateRef.current[idx][uri] = null;
                          }
                        }}
                        onChange={(state, idx = index) => {
                          if (typeof multipleStateRef.current[idx] !== 'object') {
                            multipleStateRef.current[idx] = {};
                          }
                          multipleStateRef.current[idx][uri] = state;
                          onImageLoad && onImageLoad(uri, chapterHash, current);
                        }}
                      />
                    </LongPressController>
                  </Box>
                );
              }
            )}
          </Flex>
        </Controller>
      );
    },
    [headers, onImageLoad, onLongPress, onTap, onZoomEnd, onZoomStart]
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
        extraData={extraData}
        viewabilityConfig={viewabilityConfig}
        drawDistance={READER_DRAW_DISTANCE}
        initialScrollIndex={initialScrollIndex}
        estimatedItemSize={windowWidth}
        estimatedListSize={estimatedListSize}
        onScroll={onScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
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
        extraData={extraData}
        viewabilityConfig={viewabilityConfig}
        drawDistance={READER_DRAW_DISTANCE}
        initialScrollIndex={initialScrollIndex}
        estimatedItemSize={windowWidth}
        estimatedListSize={estimatedListSize}
        onScroll={onScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
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
export default memo(forwardRef(Reader), areReaderPropsEqual);
