import React, { Fragment, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Text,
  Icon,
  HStack,
  Pressable,
  Toast,
  useDisclose,
  View,
  Button,
} from 'native-base';
import {
  nonNullable,
  coverAspectRatio,
  statusToLabel,
  Sequence,
  ChapterOptions,
  MangaStatus,
  AsyncStatus,
} from '~/utils';
import { useOnce, useSplitWidth, useDebouncedSafeAreaInsets } from '~/hooks';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { StyleSheet, Linking } from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import StaticCachedImage from '~/components/StaticCachedImage';
import ActionsheetSelect, { ActionsheetSelectProps } from '~/components/ActionsheetSelect';
import Drawer, { DrawerRef } from '~/components/Drawer';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import SpinLoading from '~/components/SpinLoading';
import VectorIcon from '~/components/VectorIcon';
import Overlay from '~/components/Overlay';
import Empty from '~/components/Empty';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import ContinueReadingButton, {
  ContinueReadingTarget,
} from '~/components/ContinueReadingButton';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

const {
  loadManga,
  setSequence,
  addFavorites,
  removeFavorites,
  disabledBatch,
  enabledBatch,
  viewFavorites,
  downloadChapter,
  exportChapter,
  removeTask,
  retryTask,
  setPrehandleLogStatus,
  setPrehandleLogVisible,
} = action;
const ChapterSelectOptions: ActionsheetSelectProps['options'] = [
  {
    label: '多选',
    value: ChapterOptions.Multiple,
    icon: { name: 'checkbox-multiple-marked-outline', source: 'materialCommunityIcons' },
  },
  {
    label: '下载',
    value: ChapterOptions.Download,
    icon: { name: 'download-box-outline', source: 'materialCommunityIcons' },
  },
  {
    label: '导出',
    value: ChapterOptions.Export,
    icon: { name: 'file-export-outline', source: 'materialCommunityIcons' },
  },
];

const EMPTY_SELECTED: string[] = [];

const Detail = ({ route, navigation }: StackDetailProps) => {
  const { mangaHash, enabledMultiple = false, selected = EMPTY_SELECTED } = route.params;
  const { gap, insets, itemWidth, numColumns, windowWidth, windowHeight } = useSplitWidth({
    gap: 12,
    minNumColumns: 3,
    maxSplitWidth: 100,
  });
  const { isOpen, onOpen, onClose } = useDisclose();
  const [chapter, setChapter] = useState<{ hash: string; title: string }>();
  const dispatch = useAppDispatch();
  const currentLoadStatus = useAppSelector(
    (state) => state.manga.loadByHash[mangaHash]?.status ?? AsyncStatus.Default
  );
  // 只订阅当前漫画，后台更新其他漫画不触发 Detail 重渲染
  const data = useAppSelector((state) => state.dict.manga[mangaHash]);
  // recordDict / lastWatchDict 在阅读时会随 viewImage/viewPage 高频更新：Detail 不可见时
  // 已被 freezeOnBlur 冻结不会重渲染；可见时需要整个 recordDict 来渲染章节列表进度，
  // 故保持现状（自定义 equalityFn 对大字典的比较成本高于收益）。
  const recordDict = useAppSelector((state) => state.dict.record);
  const lastWatchDict = useAppSelector((state) => state.dict.lastWatch);
  // favorites 收窄为派生订阅：只关心当前漫画是否收藏，避免后台批量更新其他收藏时重渲染。
  const isFavorited = useAppSelector((state) =>
    state.favorites.some((item) => item.mangaHash === mangaHash)
  );
  const sequence = useAppSelector((state) => state.setting.sequence);
  const lastWatch = useMemo(() => lastWatchDict[mangaHash] || {}, [lastWatchDict, mangaHash]);
  const extraData = useMemo(
    () => ({
      width: itemWidth,
      dict: recordDict,
      chapterHash: lastWatch.chapter,
      multiple: enabledMultiple,
      checkList: selected,
    }),
    [itemWidth, recordDict, lastWatch.chapter, enabledMultiple, selected]
  );
  const chapters = useMemo(() => {
    if (!data) {
      return [];
    }

    if (sequence === Sequence.Desc) {
      return data.chapters;
    } else {
      return [...data.chapters].reverse();
    }
  }, [data, sequence]);
  const palette = useThemePalette();

  useOnce(() => {
    if (!data || data.chapters.length <= 0) {
      dispatch(loadManga({ mangaHash }));
    }
  });

  useFocusEffect(
    useCallback(() => {
      dispatch(setPrehandleLogVisible(true));
      return () => {
        dispatch(setPrehandleLogVisible(false));
      };
    }, [dispatch])
  );
  useFocusEffect(
    useCallback(() => {
      nonNullable(data) && navigation.setOptions({ title: data.title });
    }, [navigation, data])
  );

  const handleReload = useCallback(() => {
    dispatch(loadManga({ mangaHash }));
  }, [dispatch, mangaHash]);
  const handleSearch = (keyword: string) => {
    if (!nonNullable(data)) {
      return;
    }
    navigation.navigate('Search', { keyword, source: data.source });
  };

  const handleMultiple = () => {
    navigation.setParams({ enabledMultiple: true, selected: [] });
  };
  const handleDownload = () => {
    chapter && dispatch(downloadChapter([chapter.hash]));
  };
  const handleExport = () => {
    chapter && dispatch(exportChapter([chapter.hash]));
  };
  const handleChapter = useCallback(
    (
      chapterHash: string,
      page = chapterHash === lastWatch.chapter ? lastWatch.page || 1 : 1
    ) => {
      if (isFavorited) {
        dispatch(viewFavorites(mangaHash));
      }

      navigation.navigate('Chapter', {
        mangaHash,
        chapterHash,
        page,
      });
    },
    [dispatch, isFavorited, lastWatch.chapter, lastWatch.page, mangaHash, navigation]
  );
  const handleContinueReading = useCallback(
    ({ chapterHash, page }: ContinueReadingTarget) => handleChapter(chapterHash, page),
    [handleChapter]
  );

  const renderItem = useCallback(
    ({
      item,
      extraData: { width, dict, chapterHash, multiple, checkList },
    }: ListRenderItemInfo<ChapterItem>) => {
      const isActived = item.hash === chapterHash;
      const isChecked = checkList.includes(item.hash);
      const record = dict[item.hash];

      const handlePress = () => {
        if (multiple) {
          // 选中态统一从 extraData.checkList 读取，与 route params 的 selected 同源
          navigation.setParams({
            selected: isChecked
              ? checkList.filter((hash: string) => hash !== item.hash)
              : [...checkList, item.hash],
          });
        } else {
          handleChapter(item.hash);
        }
      };
      const handleLongPress = () => {
        if (!multiple) {
          onOpen();
          setChapter({ hash: item.hash, title: item.title });
        }
      };

      return (
        <ChapterCell
          title={item.title}
          width={width}
          gap={gap}
          isActived={isActived}
          isChecked={isChecked}
          multiple={multiple}
          showProgress={!multiple && nonNullable(record) && record.progress >= 0}
          isVisited={nonNullable(record) && record.isVisited}
          onPress={handlePress}
          onLongPress={handleLongPress}
        />
      );
    },
    [gap, handleChapter, navigation, onOpen]
  );

  if (!nonNullable(data)) {
    if (currentLoadStatus === AsyncStatus.Rejected) {
      return <ErrorWithRetry color={palette.text} height="full" onRetry={handleReload} />;
    }
    if (currentLoadStatus === AsyncStatus.Fulfilled) {
      return <Empty text="未找到漫画详情" onPress={handleReload} />;
    }
    return (
      <Flex w="full" h="full" alignItems="center" justifyContent="center">
        <SpinLoading />
      </Flex>
    );
  }

  return (
    <Box w="full" h="full" bg={palette.bg}>
      <Flex
        safeAreaX
        w="full"
        bg={palette.card}
        flexDirection="row"
        pl={4}
        pr={4}
        pb={4}
      >
        <StaticCachedImage
          headers={data.headers}
          source={data.infoCover || data.bookCover || data.cover || ''}
          style={{
            ...styles.img,
            width: Math.min(Math.min(windowWidth, windowHeight) / 3, 180),
            height: Math.min(Math.min(windowWidth, windowHeight) / 3, 180) / coverAspectRatio,
          }}
          resizeMode="cover"
        />
        <Flex flexGrow={1} flexShrink={1} pl={4}>
          <HStack alignItems="center">
            <Text
              flex={1}
              color={palette.text}
              fontSize={18}
              fontWeight="bold"
              numberOfLines={2}
              onPress={() => data.title && handleSearch(data.title)}
            >
              {data.title}
            </Text>
            <VectorIcon
              name="replay"
              size="md"
              accessibilityLabel="刷新漫画详情"
              onPress={handleReload}
            />
          </HStack>
          <MetaField label="作者" list={data.author} onSearch={handleSearch} />
          <Box flexGrow={1} />
          <HStack alignItems="center" space={2}>
            <Text
              flex={1}
              color={palette.text}
              fontSize={14}
              fontWeight="bold"
              numberOfLines={1}
            >
              上次观看：{lastWatch.title || '未知'}
            </Text>
            <ContinueReadingButton
              chapters={data.chapters}
              lastWatch={lastWatch}
              onContinue={handleContinueReading}
            />
          </HStack>
          <MetaField label="分类" list={data.tag} onSearch={handleSearch} />
          <Text color={palette.text} fontSize={14} fontWeight="bold" numberOfLines={1}>
            来源：{data.sourceName}
          </Text>
          <Text color={palette.text} fontSize={14} fontWeight="bold" numberOfLines={1}>
            状态：{statusToLabel(data.status)}
          </Text>
          <Text color={palette.text} fontSize={14} fontWeight="bold" numberOfLines={1}>
            最近更新：{data.updateTime || '未知'}
          </Text>
        </Flex>
      </Flex>

      <Box flex={1}>
        {chapters.length > 0 ? (
          <FlashList
            data={chapters}
            extraData={extraData}
            contentContainerStyle={{
              padding: gap / 2,
              paddingLeft: gap / 2 + insets.left,
              paddingRight: gap / 2 + insets.right,
            }}
            numColumns={numColumns}
            estimatedItemSize={50}
            estimatedListSize={{
              width: windowWidth,
              height: windowHeight,
            }}
            renderItem={renderItem}
            ListFooterComponent={<Box safeAreaBottom />}
            keyExtractor={(item) => item.hash}
          />
        ) : currentLoadStatus === AsyncStatus.Rejected ? (
          <ErrorWithRetry color={palette.text} height="full" onRetry={handleReload} />
        ) : currentLoadStatus === AsyncStatus.Fulfilled ? (
          <Empty text="暂无章节" onPress={handleReload} />
        ) : (
          <Flex w="full" flexGrow={1} alignItems="center" justifyContent="center" safeAreaBottom>
            <SpinLoading />
          </Flex>
        )}
      </Box>

      <ActionsheetSelect
        isOpen={isOpen}
        onClose={onClose}
        options={ChapterSelectOptions}
        onChange={(value) => {
          if (value === ChapterOptions.Multiple) {
            handleMultiple();
          }
          if (value === ChapterOptions.Download) {
            handleDownload();
          }
          if (value === ChapterOptions.Export) {
            handleExport();
          }
        }}
        headerComponent={
          <Text w="full" pl={4} pb={4} color={palette.subText} fontSize={16}>
            {chapter?.title}
          </Text>
        }
      />
    </Box>
  );
};

export const HeartAndBrowser = () => {
  const route = useRoute<StackDetailProps['route']>();
  const navigation = useNavigation<StackDetailProps['navigation']>();
  const { mangaHash, enabledMultiple = false, selected = EMPTY_SELECTED } = route.params;
  const dispatch = useAppDispatch();
  const sequence = useAppSelector((state) => state.setting.sequence);
  // 只订阅当前漫画的收藏条目，避免后台批量更新其他收藏时重渲染 header。
  const favorite = useAppSelector((state) =>
    state.favorites.find((item) => item.mangaHash === mangaHash)
  );
  // 只订阅当前漫画条目，后台批量更新其他漫画不触发 header 重渲染
  const manga = useAppSelector((state) => state.dict.manga[mangaHash]);
  const palette = useThemePalette();
  const { isActived, enableBatch } = useMemo(
    () => ({ isActived: Boolean(favorite), enableBatch: favorite?.enableBatch || false }),
    [favorite]
  );

  const handleClose = () => {
    navigation.setParams({ enabledMultiple: false, selected: [] });
  };
  const handleCheckAll = () => {
    if (manga) {
      navigation.setParams({
        selected:
          selected.length < manga.chapters.length ? manga.chapters.map((item) => item.hash) : [],
      });
    }
  };
  const handleDownload = () => {
    selected.length > 0 && dispatch(downloadChapter(selected));
    handleClose();
  };
  const handleExport = () => {
    selected.length > 0 && dispatch(exportChapter(selected));
    handleClose();
  };

  const handleSwapSequence = () => {
    dispatch(setSequence(sequence === Sequence.Asc ? Sequence.Desc : Sequence.Asc));
  };
  const handleOpenDownloadManager = () => {
    dispatch(setPrehandleLogStatus(true));
  };
  const toggleFavorite = () => {
    const status = manga?.status || '';
    dispatch(
      isActived
        ? removeFavorites(mangaHash)
        : addFavorites({ mangaHash, enableBatch: status !== MangaStatus.End })
    );
  };
  const {
    isOpen: isBrowserConfirmOpen,
    onOpen: onBrowserConfirmOpen,
    onClose: onBrowserConfirmClose,
  } = useDisclose();
  const handleToBrowser = () => {
    onBrowserConfirmClose();
    const href = manga?.href || '';
    Linking.canOpenURL(href).then((supported) => {
      supported && Linking.openURL(href);
    });
  };
  const toggleQueue = () => {
    dispatch(enableBatch ? disabledBatch(mangaHash) : enabledBatch(mangaHash));
    Toast.show({
      title: enableBatch ? '已禁用批量更新' : '已启用批量更新',
      placement: 'bottom',
    });
  };

  if (enabledMultiple) {
    return (
      <HStack pr={1}>
        <VectorIcon
          source="materialCommunityIcons"
          name="window-close"
          accessibilityLabel="退出章节多选"
          onPress={handleClose}
        />
        {manga && (
          <VectorIcon
            source="materialCommunityIcons"
            name={
              selected.length <= 0
                ? 'checkbox-blank-outline'
                : selected.length >= manga.chapters.length
                ? 'checkbox-marked-outline'
                : 'checkbox-intermediate'
            }
            accessibilityLabel="全选或取消全选章节"
            accessibilityState={{
              checked:
                selected.length <= 0
                  ? false
                  : selected.length >= manga.chapters.length
                    ? true
                    : 'mixed',
            }}
            onPress={handleCheckAll}
          />
        )}
        <VectorIcon
          source="materialCommunityIcons"
          name="download-box-outline"
          accessibilityLabel="下载所选章节"
          onPress={handleDownload}
        />
        <VectorIcon
          source="materialCommunityIcons"
          name="file-export-outline"
          accessibilityLabel="导出所选章节"
          onPress={handleExport}
        />
      </HStack>
    );
  }

  return (
    <Fragment>
      <HStack pr={1}>
        {isActived && (
          <VectorIcon
            name={enableBatch ? 'lock-open' : 'lock-outline'}
            color={enableBatch ? palette.text : palette.disabled}
            accessibilityLabel={enableBatch ? '停止自动更新此漫画' : '自动更新此漫画'}
            accessibilityState={{ checked: enableBatch }}
            onPress={toggleQueue}
          />
        )}
        <VectorIcon
          source="materialCommunityIcons"
          name={isActived ? 'heart' : 'heart-outline'}
          color={palette.text}
          accessibilityLabel={isActived ? '取消收藏' : '收藏漫画'}
          accessibilityState={{ checked: isActived }}
          onPress={toggleFavorite}
        />
        <VectorIcon
          source="octicons"
          name={sequence === Sequence.Asc ? 'sort-asc' : 'sort-desc'}
          accessibilityLabel="切换章节排序"
          onPress={handleSwapSequence}
        />
        <VectorIcon
          source="materialCommunityIcons"
          name="download-box-outline"
          accessibilityLabel="打开下载管理"
          onPress={handleOpenDownloadManager}
        />
        <VectorIcon
          name="open-in-browser"
          accessibilityLabel="在浏览器中打开漫画"
          onPress={onBrowserConfirmOpen}
        />
      </HStack>

      <Overlay isOpen={isBrowserConfirmOpen} title="提示" onClose={onBrowserConfirmClose}>
        <View p={4}>
          <Text color={palette.text} fontSize="md">
            即将离开应用，在浏览器中打开此漫画的源站页面？
          </Text>
          <Button.Group size="sm" space="sm" mt={4} justifyContent="flex-end">
            <Button px={5} variant="outline" colorScheme="gray" onPress={onBrowserConfirmClose}>
              取消
            </Button>
            <Button px={5} onPress={handleToBrowser}>
              确认
            </Button>
          </Button.Group>
        </View>
      </Overlay>
    </Fragment>
  );
};

/** 详情元信息行（作者/分类）：顿号分隔、可点击搜索、空值显示未知 */
const MetaField = ({
  label,
  list,
  onSearch,
}: {
  label: string;
  list: string[];
  onSearch: (text: string) => void;
}) => {
  const palette = useThemePalette();
  return (
    <Text color={palette.text} fontSize={14} fontWeight="bold" numberOfLines={1}>
      {label}：
      {list.map((text, index) => (
        <Fragment key={text}>
          <Text onPress={() => onSearch(text)}>{text}</Text>
          {index < list.length - 1 && <Text>、</Text>}
        </Fragment>
      ))}
      {list.length <= 0 && '未知'}
    </Text>
  );
};

interface ChapterCellProps {  title: string;
  width: number;
  gap: number;
  isActived: boolean;
  isChecked: boolean;
  multiple: boolean;
  showProgress: boolean;
  isVisited?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/** 章节格子：按压瞬时反色（当前章回落正色），无动画 */
const ChapterCell = ({
  title,
  width,
  gap,
  isActived,
  isChecked,
  multiple,
  showProgress,
  isVisited,
  onPress,
  onLongPress,
}: ChapterCellProps) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  const inverted = isActived !== pressed;
  const foreground = inverted ? palette.selectedText : palette.text;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={200} {...bind}>
      <Box w={width + gap} p={`${gap / 2}px`} position="relative">
        <Text
          px={1}
          py={2}
          position="relative"
          bg={inverted ? palette.selectedBg : 'transparent'}
          color={inverted ? palette.selectedText : palette.subText}
          borderColor={inverted ? palette.border : palette.subText}
          overflow="hidden"
          borderRadius="md"
          borderWidth={0.5}
          textAlign="center"
          numberOfLines={1}
          fontWeight="bold"
        >
          {title}
        </Text>
        {multiple && (
          <Icon
            as={MaterialCommunityIcons}
            size="sm"
            name="check-circle"
            color={isChecked ? foreground : palette.disabled}
            position="absolute"
            top={`${gap / 3}px`}
            right={`${gap / 3}px`}
          />
        )}
        {showProgress && (
          <Icon
            as={MaterialIcons}
            size="xs"
            style={{ transform: [{ rotateZ: '30deg' }] }}
            name={isVisited ? 'brightness-1' : 'brightness-2'}
            color={isVisited || inverted ? foreground : palette.subText}
            position="absolute"
            top={`${gap / 3}px`}
            right={`${gap / 3}px`}
          />
        )}
      </Box>
    </Pressable>
  );
};

export const PrehandleDrawer = () => {
  const showDrawer = useAppSelector((state) => state.chapter.showDrawer);
  return showDrawer ? <VisiblePrehandleDrawer /> : null;
};

/** 失败任务重试角标：按压瞬时反色，无动画 */
const RetryBadge = ({
  count,
  onRetry,
  onRemove,
}: {
  count: number;
  onRetry: () => void;
  onRemove: () => void;
}) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  return (
    <Pressable
      px={1}
      {...bind}
      bg={pressed ? palette.selectedBg : 'transparent'}
      onPress={onRetry}
      onLongPress={onRemove}
    >
      <Text fontWeight="bold" fontSize="sm" color={pressed ? palette.selectedText : palette.text}>
        {count}
      </Text>
    </Pressable>
  );
};

const VisiblePrehandleDrawer = () => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.task.list);
  const openDrawer = useAppSelector((state) => state.chapter.openDrawer);
  const drawerRef = useRef<DrawerRef>(null);
  const insets = useDebouncedSafeAreaInsets();
  const palette = useThemePalette();

  useFocusEffect(
    useCallback(() => {
      if (openDrawer) {
        drawerRef.current?.open();
        dispatch(setPrehandleLogStatus(false));
      }
    }, [dispatch, openDrawer])
  );

  const handleRemove = useCallback(
    (taskId: string) => {
      dispatch(removeTask(taskId));
    },
    [dispatch]
  );
  const handleRetry = useCallback(
    (taskId: string) => {
      dispatch(retryTask([taskId]));
    },
    [dispatch]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Task>) => {
      const progress =
        item.queue.length > 0 ? (item.success.length + item.fail.length) / item.queue.length : 1;
      return (
        <HStack
          h="12"
          pl={3}
          pr={2}
          space={1}
          alignItems="center"
          borderColor={palette.border}
          borderBottomWidth={1}
          borderTopWidth={index === 0 ? 1 : 0}
        >
          <Text
            flex={1}
            fontWeight="bold"
            fontSize="md"
            color={progress >= 1 ? palette.text : palette.subText}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.status === AsyncStatus.Pending && (
            <Box ml={1}>
              <SpinLoading size="sm" height={1} color={palette.subText} />
            </Box>
          )}
          {item.status === AsyncStatus.Rejected && (
            <RetryBadge
              count={item.fail.length}
              onRetry={() => handleRetry(item.taskId)}
              onRemove={() => handleRemove(item.taskId)}
            />
          )}
        </HStack>
      );
    },
    [palette, handleRetry, handleRemove]
  );

  return (
    <Drawer ref={drawerRef}>
      <Box bg={palette.bg} h="full">
        {list.length > 0 && (
          <FlashList
            data={list}
            renderItem={renderItem}
            keyExtractor={(item) => item.taskId}
            estimatedItemSize={50}
            contentContainerStyle={{
              paddingTop: insets.top,
              paddingRight: insets.right,
              paddingBottom: insets.bottom,
            }}
          />
        )}
      </Box>
    </Drawer>
  );
};

const styles = StyleSheet.create({
  img: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

export default Detail;
