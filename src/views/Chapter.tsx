import React, { useRef, useMemo, useState, useCallback, Fragment, useEffect } from 'react';
import {
  AsyncStatus,
  LayoutMode,
  ReaderDirection,
  PositionX,
  Orientation,
  MultipleSeat,
  PageKeys,
  Timer,
  PageKeyDirection,
  getReaderPrefetchUris,
} from '~/utils';
import Cache from '~/utils/cache';
import {
  Box,
  Text,
  Flex,
  Center,
  HStack,
  Pressable,
  StatusBar,
  useToast,
  useDisclose,
} from 'native-base';
import { usePrevNext, usePageKeys, useDebouncedSafeAreaFrame, useInterval } from '~/hooks';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { useFocusEffect } from '@react-navigation/native';
import Reader, { ReaderRef } from '~/components/Reader';
import ActionsheetSelect from '~/components/ActionsheetSelect';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import SpinLoading from '~/components/SpinLoading';
import InputModal from '~/components/InputModal';
import VectorIcon from '~/components/VectorIcon';
import Empty from '~/components/Empty';
import { CacheManager } from '@georstat/react-native-image-cache';
import { useThemePalette } from '~/utils/theme/hooks';

const {
  loadChapter,
  viewChapter,
  viewPage,
  viewImage,
  setMode,
  setDirection,
  setSeat,
  setPageKeys,
  setTimer,
  setTimerGap,
  saveImage,
} = action;

const EMPTY_CHAPTERS: ChapterItem[] = [];
const lastPageToastId = 'LAST_PAGE_TOAST_ID';
const ImageSelectOptions = [{ label: '保存图片', value: 'save' }];
const layoutIconDict = {
  [LayoutMode.Horizontal]: 'book-open-page-variant-outline',
  [LayoutMode.Vertical]: 'filmstrip',
  [LayoutMode.Multiple]: 'book-open-outline',
};

const useChapterFlat = (hashList: string[], dict: RootState['dict']['chapter']) => {
  return useMemo(() => {
    const list: {
      uri: string;
      needUnscramble?: boolean | undefined;
      pre: number;
      multiplePre: number;
      current: number;
      chapterHash: string;
    }[] = [];

    hashList.forEach((hash) => {
      const chapter = dict[hash];
      const images = chapter?.images || [];
      const pre = list.length;
      const multiplePre =
        list.length > 0
          ? list[list.length - 1].multiplePre + Math.ceil(list[list.length - 1].current / 2)
          : 0;
      images.forEach((item, index) =>
        list.push({ ...item, pre, multiplePre, current: index + 1, chapterHash: hash })
      );
    });

    return list;
  }, [hashList, dict]);
};

const Chapter = ({ route, navigation }: StackChapterProps) => {
  const { mangaHash, chapterHash: initChapterHash, page: initPage } = route.params || {};
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const dispatch = useAppDispatch();
  const palette = useThemePalette();
  const bg = palette.bg;
  const color = palette.text;
  const { isOpen, onOpen, onClose } = useDisclose();
  const { isOpen: isMenuOpen, onOpen: onMenuOpen, onClose: onMenuClose } = useDisclose();
  const onOpenRef = useRef(onOpen);
  const onMenuCloseRef = useRef(onMenuClose);
  onOpenRef.current = onOpen;
  onMenuCloseRef.current = onMenuClose;
  const { isOpen: isJumpOpen, onOpen: onJumpOpen, onClose: onJumpClose } = useDisclose();
  const {
    isOpen: isTimerGapOpen,
    onOpen: onTimerGapOpen,
    onClose: onTimerGapClose,
  } = useDisclose();
  const [page, setPage] = useState(initPage - 1);
  const [showExtra, setShowExtra] = useState(false);
  const [timerSwitch, setTimerSwitch] = useState(true);
  const [chapterHash, setChapterHash] = useState(initChapterHash);
  const [hashList, setHashList] = useState([initChapterHash]);

  const { orientation } = useDebouncedSafeAreaFrame();
  const loadStatus = useAppSelector(
    (state) => state.chapter.loadByHash[chapterHash] ?? AsyncStatus.Default
  );
  const seat = useAppSelector((state) => state.setting.seat);
  const mode = useAppSelector((state) => state.setting.mode);
  const timer = useAppSelector((state) => state.setting.timer);
  const timerGap = useAppSelector((state) => state.setting.timerGap);
  const pageKeys = useAppSelector((state) => state.setting.pageKeys);
  const direction = useAppSelector((state) => state.setting.direction);
  // 只订阅当前漫画的章节列表，后台更新其他漫画不触发 Chapter 重渲染
  const chapterList = useAppSelector(
    (state) => state.dict.manga[mangaHash]?.chapters ?? EMPTY_CHAPTERS
  );
  // 只订阅当前阅读链上的几个章节，并做浅比较；下载/批量更新其他章节不触发 Chapter 重渲染
  const chapterSlice = useAppShallowSelector((state) =>
    hashList.map((hash) => state.dict.chapter[hash])
  );
  const chapterDict = useMemo(() => {
    const dict: Record<string, RootState['dict']['chapter'][string]> = {};
    hashList.forEach((hash, idx) => {
      const chapter = chapterSlice[idx];
      if (chapter) {
        dict[hash] = chapter;
      }
    });
    return dict;
  }, [chapterSlice, hashList]);

  const inverted = useMemo(
    () => mode !== LayoutMode.Vertical && direction === ReaderDirection.Left,
    [mode, direction]
  );
  const data = useChapterFlat(hashList, chapterDict);
  const { pre, current, multiplePre } = useMemo(
    () => data[page] || { pre: 0, current: 0, multiplePre: 0 },
    [page, data]
  );
  const { title, headers, max } = useMemo(() => {
    const chapter = chapterDict[chapterHash];
    return {
      title: chapter?.title || '',
      headers: chapter?.headers || {},
      max: (chapter?.images || []).length,
    };
  }, [chapterDict, chapterHash]);
  const [prev, next] = usePrevNext(chapterList, chapterHash);
  const [, more] = usePrevNext(chapterList, hashList[hashList.length - 1]);
  const readerRef = useRef<ReaderRef>(null);
  const callbackRef = useRef<((direction: PageKeyDirection) => void) | undefined>(undefined);
  const sourceRef = useRef('');
  const [render, setRender] = useState(false);
  const cache = useMemo(() => new Cache(mangaHash), [mangaHash]);

  callbackRef.current = (pageKeyDirection) => {
    if (pageKeyDirection === 'next') {
      handleNextPage();
    }
    if (pageKeyDirection === 'previous') {
      handlePrevPage();
    }
  };

  useFocusEffect(
    useCallback(() => {
      dispatch(viewChapter({ mangaHash, chapterHash, chapterTitle: title }));
    }, [dispatch, mangaHash, chapterHash, title])
  );
  useFocusEffect(
    useCallback(() => {
      if (data.length <= 0) {
        dispatch(loadChapter({ chapterHash }));
      }
    }, [dispatch, chapterHash, data.length])
  );
  useFocusEffect(
    useCallback(() => {
      dispatch(viewPage({ mangaHash, page: current }));
    }, [current, dispatch, mangaHash])
  );
  const init = useCallback(async () => {
    setRender(false);
    try {
      await cache.initCacheMap();
    } catch (error) {
    } finally {
      setRender(true);
    }
  }, [cache]);
  useFocusEffect(
    useCallback(() => {
      init();
      return () => {
        cache.storeCacheMap();
      };
    }, [init, cache])
  );
  usePageKeys(
    useCallback(
      (pageKeyDirection: PageKeyDirection) =>
        callbackRef.current && callbackRef.current(pageKeyDirection),
      []
    ),
    pageKeys === PageKeys.Enable && data.length > 0 && loadStatus !== AsyncStatus.Pending
  );
  useInterval(
    useCallback(() => callbackRef.current && callbackRef.current('next'), []),
    timer === Timer.Enable && timerSwitch && data.length > 0 && loadStatus !== AsyncStatus.Pending,
    timerGap
  );
  const prefetchKey = useMemo(
    () => getReaderPrefetchUris(data, page).join('\u0000'),
    [data, page]
  );

  // 前后相邻页由 Reader 保持挂载；磁盘层再多准备后一页，窗口固定且不解码离屏加密图。
  useEffect(() => {
    if (prefetchKey) {
      CacheManager.prefetch(prefetchKey.split('\u0000'), { headers });
    }
  }, [prefetchKey, headers]);

  const handlePrevPage = useCallback(() => {
    if (mode !== LayoutMode.Multiple) {
      readerRef.current?.scrollToIndex(Math.max(page - 1, 0));
    } else {
      readerRef.current?.scrollToIndex(Math.max(multiplePre + Math.ceil(current / 2) - 2, 0));
    }
  }, [current, mode, multiplePre, page]);
  const handleNextPage = useCallback(() => {
    if (data.length === 0) {
      return;
    }
    if (mode !== LayoutMode.Multiple) {
      readerRef.current?.scrollToIndex(Math.min(page + 1, Math.max(data.length - 1, 0)));
    } else {
      const multipleMax = data[data.length - 1].multiplePre + data[data.length - 1].current;
      readerRef.current?.scrollToIndex(
        Math.min(multiplePre + Math.ceil(current / 2), Math.max(multipleMax - 1, 0))
      );
    }
  }, [current, data, mode, multiplePre, page]);
  const handlePrevChapter = useCallback(() => {
    if (prev) {
      setChapterHash(prev.hash);
      setHashList([prev.hash]);
      setPage(0);
      readerRef.current?.clearStateRef();
      // 旧 Reader 仍持有上一章 data；只负责归零视图，不得把旧章节页码回写到状态。
      readerRef.current?.scrollToIndex(0, false);
    } else {
      toastRef.current.show({ title: '第一话' });
    }
  }, [prev]);
  const handleNextChapter = useCallback(() => {
    if (next) {
      setChapterHash(next.hash);
      setHashList([next.hash]);
      setPage(0);
      readerRef.current?.clearStateRef();
      readerRef.current?.scrollToIndex(0, false);
    } else {
      toastRef.current.show({ title: '最后一话' });
    }
  }, [next]);
  const handleTap = useCallback(
    (position: PositionX) => {
      if (position === PositionX.Mid) {
        setShowExtra((isVisible) => {
          isVisible && onMenuCloseRef.current();
          return !isVisible;
        });
      }
      if (inverted) {
        if (position === PositionX.Right) {
          callbackRef.current?.('previous');
        }
        if (position === PositionX.Left) {
          callbackRef.current?.('next');
        }
      } else {
        if (position === PositionX.Left) {
          callbackRef.current?.('previous');
        }
        if (position === PositionX.Right) {
          callbackRef.current?.('next');
        }
      }
    },
    [inverted]
  );
  const handleLongPress = useCallback(
    (position: PositionX, source?: string) => {
      if (position === PositionX.Mid) {
        sourceRef.current = source || '';
        onOpenRef.current();
      }
      if (inverted) {
        if (position === PositionX.Right) {
          handlePrevChapter();
        }
        if (position === PositionX.Left) {
          handleNextChapter();
        }
      } else {
        if (position === PositionX.Left) {
          handlePrevChapter();
        }
        if (position === PositionX.Right) {
          handleNextChapter();
        }
      }
    },
    [handleNextChapter, handlePrevChapter, inverted]
  );
  const handleImageLoad = useCallback(
    (_uri: string, hash: string, index: number) => {
      dispatch(viewImage({ chapterHash: hash, index }));
    },
    [dispatch]
  );
  const handlePageChange = useCallback(
    (newPage: number) => {
      const image = data[newPage];
      if (!image) {
        return;
      }
      if (newPage >= data.length - 1 && !next && !toastRef.current.isActive(lastPageToastId)) {
        toastRef.current.show({ id: lastPageToastId, title: '最后一页' });
      }

      setChapterHash(image.chapterHash);
      setPage(newPage);
    },
    [data, next]
  );
  const handleLoadMore = useCallback(() => {
    if (more && !hashList.includes(more.hash)) {
      setHashList([...hashList, more.hash]);
      !chapterDict[more.hash] && dispatch(loadChapter({ chapterHash: more.hash }));
    }
  }, [chapterDict, dispatch, hashList, more]);

  const handleScrollBeginDrag = useCallback(() => setTimerSwitch(false), []);
  const handleScrollEndDrag = useCallback(() => setTimerSwitch(true), []);
  const handleZoomStart = useCallback(() => setTimerSwitch(false), []);
  const handleZoomEnd = useCallback((scale: number) => setTimerSwitch(scale <= 1), []);
  useEffect(() => {
    // Reader 因方向/布局/章节变化重建时，旧手势不会再回调，主动恢复定时器状态。
    setTimerSwitch(true);
  }, [chapterHash, mode, orientation]);

  const handleImageSave = useCallback(() => {
    if (sourceRef.current !== '') {
      dispatch(saveImage({ source: sourceRef.current, headers }));
    } else {
      toast.show({ title: '保存失败' });
    }
  }, [dispatch, headers, toast]);
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleSeatToggle = useCallback(() => {
    if (seat === MultipleSeat.AToB) {
      toast.show({ title: '双页漫画顺序: 从右向左' });
      dispatch(setSeat(MultipleSeat.BToA));
    } else {
      toast.show({ title: '双页漫画顺序: 从左向右' });
      dispatch(setSeat(MultipleSeat.AToB));
    }
  }, [dispatch, seat, toast]);
  const handlePageKeysToggle = useCallback(() => {
    if (pageKeys === PageKeys.Enable) {
      toast.show({ title: '已关闭实体键翻页' });
      dispatch(setPageKeys(PageKeys.Disabled));
    } else {
      toast.show({ title: '已开启实体键翻页' });
      dispatch(setPageKeys(PageKeys.Enable));
    }
  }, [dispatch, pageKeys, toast]);
  const handleTimerToggle = useCallback(() => {
    if (timer === Timer.Enable) {
      toast.show({ title: '已关闭定时翻页' });
      dispatch(setTimer(Timer.Disabled));
    } else {
      toast.show({ title: `已开启定时翻页，间隔${(timerGap / 1000).toFixed(1)}s` });
      dispatch(setTimer(Timer.Enable));
    }
  }, [dispatch, timer, timerGap, toast]);
  const handleOrientationToggle = useCallback(
    () =>
      navigation.setOptions({
        orientation: orientation === Orientation.Portrait ? 'landscape_right' : 'portrait',
      }),
    [navigation, orientation]
  );
  const handleReload = useCallback(() => {
    setChapterHash(chapterHash);
    setHashList([chapterHash]);
    readerRef.current?.clearStateRef();
    dispatch(loadChapter({ chapterHash }));
  }, [chapterHash, dispatch]);
  const handleDirectionToggle = useCallback(() => {
    if (inverted) {
      toast.show({ title: '阅读方向: 从左向右' });
      dispatch(setDirection(ReaderDirection.Right));
    } else {
      toast.show({ title: '阅读方向: 从右向左' });
      dispatch(setDirection(ReaderDirection.Left));
    }
  }, [dispatch, inverted, toast]);
  const handleVertical = useCallback(() => {
    toast.show({ title: '条漫模式' });
    dispatch(setMode(LayoutMode.Vertical));
  }, [dispatch, toast]);
  const handleHorizontal = useCallback(() => {
    toast.show({ title: '翻页模式' });
    dispatch(setMode(LayoutMode.Horizontal));
  }, [dispatch, toast]);
  const handleMultiple = useCallback(() => {
    toast.show({ title: '双页模式' });
    dispatch(setMode(LayoutMode.Multiple));
  }, [dispatch, toast]);
  const handleModeToggle = useCallback(() => {
    switch (mode) {
      case LayoutMode.Horizontal: {
        handleVertical();
        break;
      }
      case LayoutMode.Vertical: {
        handleMultiple();
        break;
      }
      case LayoutMode.Multiple:
      default: {
        handleHorizontal();
        break;
      }
    }
  }, [handleHorizontal, handleMultiple, handleVertical, mode]);
  const handleTimerGapOpen = useCallback(() => {
    dispatch(setTimer(Timer.Disabled));
    onTimerGapOpen();
  }, [dispatch, onTimerGapOpen]);
  const handleTimerGapClose = useCallback(
    (value: string) => {
      const gap = Number(value);

      if (gap >= 500) {
        dispatch(setTimerGap(gap));
        onTimerGapClose();
      } else {
        toast.show({ title: '间隔不能低于500ms' });
      }
    },
    [dispatch, onTimerGapClose, toast]
  );
  /** 数字跳页：瞬时定位，无动画 */
  const handleJumpPage = useCallback(
    (value: string) => {
      const newStep = Number(value);
      if (!Number.isInteger(newStep) || newStep < 1) {
        onJumpClose();
        return;
      }
      const step = Math.min(newStep, Math.max(max, 1));
      const newPage = pre + Math.floor(step - 1);
      const multiplePage = multiplePre + Math.floor((step - 1) / 2);
      if (step > max - 5) {
        handleLoadMore();
      }
      setPage(newPage);
      readerRef.current?.scrollToIndex(mode !== LayoutMode.Multiple ? newPage : multiplePage);
      onJumpClose();
    },
    [handleLoadMore, max, mode, multiplePre, onJumpClose, pre]
  );

  if (data.length <= 0) {
    if (loadStatus === AsyncStatus.Pending) {
      return (
        <Center w="full" h="full" bg={bg}>
          <SpinLoading color={color} />
        </Center>
      );
    }
    if (loadStatus === AsyncStatus.Fulfilled) {
      return <Empty bg={bg} color={color} text="该章节是空的" onPress={handleReload} />;
    }
    if (loadStatus === AsyncStatus.Rejected) {
      return (
        <Center w="full" h="full" bg={bg}>
          <ErrorWithRetry color={color} onRetry={handleReload} />
        </Center>
      );
    }
  }

  return (
    <Box w="full" h="full" bg={bg}>
      <StatusBar
        backgroundColor={bg}
        hidden={!showExtra}
        barStyle={bg === '#000000' ? 'light-content' : 'dark-content'}
      />
      {render && (
        <Reader
          key={orientation}
          ref={readerRef}
          data={data}
          headers={headers}
          initPage={page}
          inverted={inverted}
          seat={seat}
          layoutMode={mode}
          onTap={handleTap}
          onLongPress={handleLongPress}
          onImageLoad={handleImageLoad}
          onPageChange={handlePageChange}
          onLoadMore={handleLoadMore}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onZoomStart={handleZoomStart}
          onZoomEnd={handleZoomEnd}
          cache={cache}
        />
      )}
      <ActionsheetSelect
        isOpen={isOpen}
        onClose={onClose}
        options={ImageSelectOptions}
        onChange={(value) => {
          if (value === 'save') {
            handleImageSave();
          }
        }}
      />
      <InputModal
        title="自动翻页间隔："
        rightAddon="ms"
        isOpen={isTimerGapOpen}
        keyboardType="number-pad"
        defaultValue={timerGap.toString()}
        onClose={handleTimerGapClose}
      />
      <InputModal
        title="跳转到第几页："
        isOpen={isJumpOpen}
        keyboardType="number-pad"
        defaultValue={current.toString()}
        onClose={handleJumpPage}
      />

      {showExtra && (
        <Fragment>
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bg={bg}
            borderBottomWidth={1}
            borderColor={palette.border}
            safeAreaTop
            safeAreaLeft
            safeAreaRight
          >
            <Flex position="relative" flexDirection="row" alignItems="center">
              <VectorIcon
                name="arrow-back"
                size="2xl"
                color={color}
                accessibilityLabel="返回漫画详情"
                onPress={handleGoBack}
              />
              <Text flexShrink={1} fontSize="md" fontWeight="bold" numberOfLines={1} color={color}>
                {title}
              </Text>
              <VectorIcon
                name="replay"
                size="md"
                color={color}
                accessibilityLabel="重新加载章节"
                onPress={handleReload}
              />

              <Box w={0} flexGrow={1} />

              <VectorIcon
                name={
                  orientation === Orientation.Portrait
                    ? 'stay-primary-portrait'
                    : 'stay-primary-landscape'
                }
                size="lg"
                color={color}
                accessibilityLabel="切换屏幕方向"
                onPress={handleOrientationToggle}
              />
              <VectorIcon
                name="dots-horizontal"
                size="lg"
                source="materialCommunityIcons"
                color={color}
                accessibilityLabel={isMenuOpen ? '关闭阅读设置' : '打开阅读设置'}
                accessibilityState={{ expanded: isMenuOpen }}
                onPress={isMenuOpen ? onMenuClose : onMenuOpen}
              />
            </Flex>

            {isMenuOpen && (
              <HStack
                borderTopWidth={1}
                borderColor={palette.border}
                justifyContent="space-around"
                py={1}
              >
                <VectorIcon
                  name={layoutIconDict[mode]}
                  size="lg"
                  source="materialCommunityIcons"
                  color={color}
                  accessibilityLabel="切换阅读布局"
                  onPress={handleModeToggle}
                />
                {mode !== LayoutMode.Vertical && (
                  <VectorIcon
                    name={inverted ? 'west' : 'east'}
                    size="lg"
                    color={color}
                    accessibilityLabel={inverted ? '改为从左向右阅读' : '改为从右向左阅读'}
                    onPress={handleDirectionToggle}
                  />
                )}
                {mode === LayoutMode.Multiple && (
                  <VectorIcon
                    name={
                      seat === MultipleSeat.AToB
                        ? 'format-letter-starts-with'
                        : 'format-letter-ends-with'
                    }
                    size="lg"
                    source="materialCommunityIcons"
                    color={color}
                    accessibilityLabel="切换双页起始位置"
                    onPress={handleSeatToggle}
                  />
                )}
                <VectorIcon
                  name={pageKeys === PageKeys.Enable ? 'keyboard-outline' : 'keyboard-off-outline'}
                  size="lg"
                  source="materialCommunityIcons"
                  color={color}
                  accessibilityLabel={
                    pageKeys === PageKeys.Enable ? '关闭实体键翻页' : '开启实体键翻页'
                  }
                  accessibilityState={{ checked: pageKeys === PageKeys.Enable }}
                  onPress={handlePageKeysToggle}
                />
                <VectorIcon
                  name={timer === Timer.Enable ? 'timer-outline' : 'timer-off-outline'}
                  size="lg"
                  source="materialCommunityIcons"
                  color={color}
                  accessibilityLabel={timer === Timer.Enable ? '关闭定时翻页' : '开启定时翻页'}
                  accessibilityHint="长按设置翻页间隔"
                  accessibilityState={{ checked: timer === Timer.Enable }}
                  onPress={handleTimerToggle}
                  onLongPress={handleTimerGapOpen}
                />
              </HStack>
            )}
          </Box>

          <Flex
            position="absolute"
            left={0}
            right={0}
            bottom={0}
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            bg={bg}
            borderTopWidth={1}
            borderColor={palette.border}
            safeAreaX
            safeAreaBottom
          >
            <VectorIcon
              name="skip-previous"
              size="lg"
              color={prev ? color : palette.disabled}
              disabled={!prev}
              accessibilityLabel="上一章"
              accessibilityState={{ disabled: !prev }}
              onPress={handlePrevChapter}
            />
            <Pressable
              flex={1}
              mx={2}
              py={2}
              borderWidth={1}
              borderColor={palette.border}
              alignItems="center"
              onPress={onJumpOpen}
            >
              <Text color={color} fontWeight="bold">
                {current} / {max}
              </Text>
            </Pressable>
            <VectorIcon
              name="skip-next"
              size="lg"
              color={next ? color : palette.disabled}
              disabled={!next}
              accessibilityLabel="下一章"
              accessibilityState={{ disabled: !next }}
              onPress={handleNextChapter}
            />
          </Flex>
        </Fragment>
      )}
    </Box>
  );
};

export default Chapter;
