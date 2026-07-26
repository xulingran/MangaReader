import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import {
  AsyncStatus,
  LayoutMode,
  ReaderDirection,
  PositionX,
  Orientation,
  PageKeys,
  Timer,
  PageKeyDirection,
  getReaderPrefetchUris,
} from '~/utils';
import Cache from '~/utils/cache';
import { Box, Center, StatusBar, useToast, useDisclose } from 'native-base';
import {
  usePrevNext,
  usePageKeys,
  useDebouncedSafeAreaFrame,
  useInterval,
  useLatest,
} from '~/hooks';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { useFocusEffect } from '@react-navigation/native';
import Reader, { ReaderRef } from '~/components/Reader';
import ReaderToolbar from '~/components/ReaderToolbar';
import ActionsheetSelect from '~/components/ActionsheetSelect';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import SpinLoading from '~/components/SpinLoading';
import InputModal from '~/components/InputModal';
import Empty from '~/components/Empty';
import { CacheManager } from '@georstat/react-native-image-cache';
import { useThemePalette } from '~/utils/theme/hooks';

const {
  loadChapter,
  viewChapter,
  viewPage,
  viewImage,
  setTimer,
  setTimerGap,
  saveImage,
} = action;

const EMPTY_CHAPTERS: ChapterItem[] = [];
const lastPageToastId = 'LAST_PAGE_TOAST_ID';
const ImageSelectOptions = [{ label: '保存图片', value: 'save' }];
// 跳页接近当前章末尾时提前把下一章挂进阅读链，避免翻到边界才开始加载
const LOAD_MORE_REMAINING_PAGES = 5;
const MIN_TIMER_GAP = 500;

/** 点按/长按区域到翻页方向的映射：从右向左阅读（inverted）时左右翻转 */
const resolveTapDirection = (
  position: PositionX,
  inverted: boolean
): 'previous' | 'next' | undefined => {
  if (position === PositionX.Mid) {
    return undefined;
  }
  return (position === PositionX.Right) === inverted ? 'previous' : 'next';
};

const useChapterFlat = (hashList: string[], dict: RootState['dict']['chapter']) => {
  return useMemo(() => {
    const list: {
      uri: string;
      needUnscramble?: boolean;
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
  const { mangaHash, chapterHash: initChapterHash, page: initPage } = route.params;
  const toast = useToast();
  const toastRef = useLatest(toast);
  const dispatch = useAppDispatch();
  const palette = useThemePalette();
  const bg = palette.bg;
  const color = palette.text;
  const { isOpen, onOpen, onClose } = useDisclose();
  const { isOpen: isMenuOpen, onOpen: onMenuOpen, onClose: onMenuClose } = useDisclose();
  const onOpenRef = useLatest(onOpen);
  const onMenuCloseRef = useLatest(onMenuClose);
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
  const sourceRef = useRef('');
  const [render, setRender] = useState(false);
  const cache = useMemo(() => new Cache(mangaHash), [mangaHash]);

  const callbackRef = useLatest((pageKeyDirection: PageKeyDirection) => {
    if (pageKeyDirection === 'next') {
      handleNextPage();
    } else if (pageKeyDirection === 'previous') {
      handlePrevPage();
    }
  });

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
  const init = useCallback(
    async (isCancelled: () => boolean) => {
      setRender(false);
      try {
        await cache.initCacheMap();
      } catch (error) {
        console.warn('章节缓存初始化失败', error);
      } finally {
        // blur 后 init 的 Promise 仍可能 resolve，此时不再回写状态
        if (!isCancelled()) {
          setRender(true);
        }
      }
    },
    [cache]
  );
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      init(() => cancelled);
      return () => {
        cancelled = true;
        cache.storeCacheMap().catch(() => {});
        // 离开阅读页时主动清理过期缓存条目，避免 LRU 在下次阅读中途触发 IO 抖动；
        // 缓存上限已下调到 256MB，prune 让磁盘占用贴近真实阅读需求。
        CacheManager.pruneCache().catch(() => {});
      };
    }, [init, cache])
  );
  usePageKeys(
    useCallback(
      (pageKeyDirection: PageKeyDirection) => callbackRef.current(pageKeyDirection),
      [callbackRef]
    ),
    pageKeys === PageKeys.Enable && data.length > 0 && loadStatus !== AsyncStatus.Pending
  );
  useInterval(
    useCallback(() => callbackRef.current('next'), [callbackRef]),
    timer === Timer.Enable && timerSwitch && data.length > 0 && loadStatus !== AsyncStatus.Pending,
    timerGap
  );
  // URI 数组 join 成字符串作为 effect key：数组引用每次 render 都变，join 后内容相同即稳定，
  // 避免重复 prefetch
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
      readerRef.current?.scrollToIndex(page - 1);
    } else {
      readerRef.current?.scrollToIndex(multiplePre + Math.ceil(current / 2) - 2);
    }
  }, [current, mode, multiplePre, page]);
  const handleNextPage = useCallback(() => {
    if (data.length === 0) {
      return;
    }
    if (mode !== LayoutMode.Multiple) {
      readerRef.current?.scrollToIndex(page + 1);
    } else {
      readerRef.current?.scrollToIndex(multiplePre + Math.ceil(current / 2));
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
  }, [prev, toastRef]);
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
  }, [next, toastRef]);
  const handleTap = useCallback(
    (position: PositionX) => {
      if (position === PositionX.Mid) {
        if (showExtra) {
          onMenuCloseRef.current();
        }
        setShowExtra(!showExtra);
      }
      const tapDirection = resolveTapDirection(position, inverted);
      if (tapDirection) {
        callbackRef.current?.(tapDirection);
      }
    },
    [callbackRef, inverted, onMenuCloseRef, showExtra]
  );
  const handleLongPress = useCallback(
    (position: PositionX, source?: string) => {
      if (position === PositionX.Mid) {
        sourceRef.current = source || '';
        onOpenRef.current();
      }
      const tapDirection = resolveTapDirection(position, inverted);
      if (tapDirection === 'previous') {
        handlePrevChapter();
      }
      if (tapDirection === 'next') {
        handleNextChapter();
      }
    },
    [handleNextChapter, handlePrevChapter, inverted, onOpenRef]
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
    [data, next, toastRef]
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
      toastRef.current.show({ title: '保存失败' });
    }
  }, [dispatch, headers, toastRef]);
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleOrientationToggle = useCallback(
    () =>
      navigation.setOptions({
        orientation: orientation === Orientation.Portrait ? 'landscape_right' : 'portrait',
      }),
    [navigation, orientation]
  );
  const handleReload = useCallback(() => {
    setHashList([chapterHash]);
    readerRef.current?.clearStateRef();
    dispatch(loadChapter({ chapterHash }));
  }, [chapterHash, dispatch]);
  const handleTimerGapOpen = useCallback(() => {
    dispatch(setTimer(Timer.Disabled));
    onTimerGapOpen();
  }, [dispatch, onTimerGapOpen]);
  const handleTimerGapClose = useCallback(
    (value: string) => {
      const gap = Number(value);

      if (gap >= MIN_TIMER_GAP) {
        dispatch(setTimerGap(gap));
        onTimerGapClose();
      } else {
        toast.show({ title: `间隔不能低于${MIN_TIMER_GAP}ms` });
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
      if (step > max - LOAD_MORE_REMAINING_PAGES) {
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
        <ReaderToolbar
          title={title}
          current={current}
          max={max}
          mode={mode}
          inverted={inverted}
          seat={seat}
          pageKeys={pageKeys}
          timer={timer}
          timerGap={timerGap}
          orientation={orientation}
          prev={prev}
          next={next}
          isMenuOpen={isMenuOpen}
          onMenuToggle={isMenuOpen ? onMenuClose : onMenuOpen}
          onGoBack={handleGoBack}
          onReload={handleReload}
          onOrientationToggle={handleOrientationToggle}
          onTimerGapOpen={handleTimerGapOpen}
          onPrevChapter={handlePrevChapter}
          onNextChapter={handleNextChapter}
          onJumpOpen={onJumpOpen}
        />
      )}
    </Box>
  );
};

export default Chapter;
