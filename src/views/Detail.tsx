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
import { useRoute, useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import StaticCachedImage from '~/components/StaticCachedImage';
import ActionsheetSelect, { ActionsheetSelectProps } from '~/components/ActionsheetSelect';
import Drawer, { DRAWER_TRIGGER_WIDTH, DrawerRef } from '~/components/Drawer';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import SpinLoading from '~/components/SpinLoading';
import VectorIcon from '~/components/VectorIcon';
import Empty from '~/components/Empty';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import ContinueReadingButton, {
  ContinueReadingTarget,
} from '~/components/ContinueReadingButton';
import { useBackgroundColor } from '~/utils/theme/hooks';

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

const Detail = ({ route, navigation }: StackDetailProps) => {
  const { mangaHash, enabledMultiple = false, selected = [] } = route.params;
  const { gap, insets, itemWidth, numColumns, windowWidth, windowHeight } = useSplitWidth({
    gap: 12,
    reservedWidth: DRAWER_TRIGGER_WIDTH,
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
  const reocrdDict = useAppSelector((state) => state.dict.record);
  const lastWatchDict = useAppSelector((state) => state.dict.lastWatch);
  const favorites = useAppSelector((state) => state.favorites);
  const sequence = useAppSelector((state) => state.setting.sequence);
  const lastWatch = useMemo(() => lastWatchDict[mangaHash] || {}, [lastWatchDict, mangaHash]);
  const extraData = useMemo(
    () => ({
      width: itemWidth,
      dict: reocrdDict,
      chapterHash: lastWatch.chapter,
      multiple: enabledMultiple,
      checkList: selected,
    }),
    [itemWidth, reocrdDict, lastWatch.chapter, enabledMultiple, selected]
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
  const bg = useBackgroundColor();

  useOnce(() => {
    if (!nonNullable(data) || (nonNullable(data) && data.chapters.length <= 0)) {
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
      if (favorites.find((item) => item.mangaHash === mangaHash)) {
        dispatch(viewFavorites(mangaHash));
      }

      navigation.navigate('Chapter', {
        mangaHash,
        chapterHash,
        page,
      });
    },
    [dispatch, favorites, lastWatch.chapter, lastWatch.page, mangaHash, navigation]
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
          navigation.setParams({
            selected: isChecked
              ? selected.filter((hash) => hash !== item.hash)
              : [...selected, item.hash],
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
        <Pressable
          _pressed={{ opacity: 0.8 }}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={200}
        >
          <Box w={width + gap} p={`${gap / 2}px`} position="relative">
            <Text
              px={1}
              py={2}
              position="relative"
              bg={isActived ? 'black' : 'transparent'}
              color={isActived ? 'white' : 'gray.600'}
              borderColor={isActived ? 'black' : 'gray.600'}
              overflow="hidden"
              borderRadius="md"
              borderWidth={0.5}
              textAlign="center"
              numberOfLines={1}
              fontWeight="bold"
            >
              {item.title}
            </Text>
            {multiple && (
              <Icon
                as={MaterialCommunityIcons}
                size="sm"
                name="check-circle"
                color={isChecked ? 'gray.500' : 'gray.400'}
                position="absolute"
                top={`${gap / 3}px`}
                right={`${gap / 3}px`}
              />
            )}
            {!multiple && record && record.progress >= 0 && (
              <Icon
                as={MaterialIcons}
                size="xs"
                style={{ transform: [{ rotateZ: '30deg' }] }}
                name={record.isVisited ? 'brightness-1' : 'brightness-2'}
                color={`gray.${Math.min(Math.floor(record.progress / 25) + 1, 5)}00`}
                position="absolute"
                top={`${gap / 3}px`}
                right={`${gap / 3}px`}
              />
            )}
          </Box>
        </Pressable>
      );
    },
    [gap, handleChapter, navigation, onOpen, selected]
  );

  if (!nonNullable(data)) {
    if (currentLoadStatus === AsyncStatus.Rejected) {
      return <ErrorWithRetry color="black" height="full" onRetry={handleReload} />;
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
    <Box w="full" h="full" bg={bg}>
      <Flex safeAreaX w="full" bg="gray.100" flexDirection="row" pl={4} pr={4} pb={4}>
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
              color="black"
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
          <Text color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
            作者：
            {data.author.map((text, index) => (
              <Fragment key={text}>
                <Text onPress={() => handleSearch(text)}>{text}</Text>
                {index < data.author.length - 1 && <Text>、</Text>}
              </Fragment>
            ))}
            {data.author.length <= 0 && '未知'}
          </Text>
          <Box flexGrow={1} />
          <HStack alignItems="center" space={2}>
            <Text flex={1} color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
              上次观看：{lastWatch.title || '未知'}
            </Text>
            <ContinueReadingButton
              chapters={data.chapters}
              lastWatch={lastWatch}
              onContinue={handleContinueReading}
            />
          </HStack>
          <Text color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
            分类：
            {data.tag.map((text, index) => (
              <Fragment key={text}>
                <Text onPress={() => handleSearch(text)}>{text}</Text>
                {index < data.tag.length - 1 && <Text>、</Text>}
              </Fragment>
            ))}
            {data.tag.length <= 0 && '未知'}
          </Text>
          <Text color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
            来源：{data.sourceName}
          </Text>
          <Text color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
            状态：{statusToLabel(data.status)}
          </Text>
          <Text color="black" fontSize={14} fontWeight="bold" numberOfLines={1}>
            最近更新：{data.updateTime || '未知'}
          </Text>
        </Flex>
      </Flex>

      <Box flex={1} mr={`${DRAWER_TRIGGER_WIDTH + insets.right}px`}>
        {chapters.length > 0 ? (
          <FlashList
            data={chapters}
            extraData={extraData}
            contentContainerStyle={{
              padding: gap / 2,
              paddingLeft: gap / 2 + insets.left,
            }}
            numColumns={numColumns}
            estimatedItemSize={50}
            estimatedListSize={{
              width: windowWidth - DRAWER_TRIGGER_WIDTH - insets.right,
              height: windowHeight,
            }}
            renderItem={renderItem}
            ListFooterComponent={<Box safeAreaBottom />}
            keyExtractor={(item) => item.hash}
          />
        ) : currentLoadStatus === AsyncStatus.Rejected ? (
          <ErrorWithRetry color="black" height="full" onRetry={handleReload} />
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
          <Text w="full" pl={4} pb={4} color="gray.500" fontSize={16}>
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
  const { mangaHash, enabledMultiple = false, selected = [] } = route.params;
  const dispatch = useAppDispatch();
  const sequence = useAppSelector((state) => state.setting.sequence);
  const favorites = useAppSelector((state) => state.favorites);
  const dict = useAppSelector((state) => state.dict.manga);
  const manga = useMemo(() => dict[mangaHash], [dict, mangaHash]);
  const { isActived, enableBatch } = useMemo(() => {
    const favorite = favorites.find((item) => item.mangaHash === mangaHash);
    return { isActived: Boolean(favorite), enableBatch: favorite?.enableBatch || false };
  }, [favorites, mangaHash]);

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
  const toggleFavorite = () => {
    const status = dict[mangaHash]?.status || '';
    dispatch(
      isActived
        ? removeFavorites(mangaHash)
        : addFavorites({ mangaHash, enableBatch: status !== MangaStatus.End })
    );
  };
  const handleToBrowser = () => {
    const href = dict[mangaHash]?.href || '';
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
    <HStack pr={1}>
      {isActived && (
        <VectorIcon
          name={enableBatch ? 'lock-open' : 'lock-outline'}
          color={enableBatch ? 'black' : 'gray.400'}
          accessibilityLabel={enableBatch ? '停止自动更新此漫画' : '自动更新此漫画'}
          accessibilityState={{ checked: enableBatch }}
          onPress={toggleQueue}
        />
      )}
      <VectorIcon
        source="materialCommunityIcons"
        name={isActived ? 'heart' : 'heart-outline'}
        color="black"
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
        name="open-in-browser"
        accessibilityLabel="在浏览器中打开漫画"
        onPress={handleToBrowser}
      />
    </HStack>
  );
};

export const PrehandleDrawer = () => {
  const showDrawer = useAppSelector((state) => state.chapter.showDrawer);
  return showDrawer ? <VisiblePrehandleDrawer /> : null;
};

const VisiblePrehandleDrawer = () => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.task.list);
  const openDrawer = useAppSelector((state) => state.chapter.openDrawer);
  const drawerRef = useRef<DrawerRef>(null);
  const insets = useDebouncedSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      if (openDrawer) {
        drawerRef.current?.open();
        dispatch(setPrehandleLogStatus(false));
      }
    }, [dispatch, openDrawer])
  );

  const handleRemove = (taskId: string) => {
    dispatch(removeTask(taskId));
  };
  const handleRetry = (taskId: string) => {
    dispatch(retryTask([taskId]));
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Task>) => {
    const progress =
      item.queue.length > 0 ? (item.success.length + item.fail.length) / item.queue.length : 1;
    return (
      <HStack
        h="12"
        pl={3}
        pr={2}
        space={1}
        key={item.taskId}
        alignItems="center"
        borderColor="gray.200"
        borderBottomWidth={1}
        borderTopWidth={index === 0 ? 1 : 0}
      >
        <Text
          flex={1}
          fontWeight="bold"
          fontSize="md"
          color={`gray.${Math.floor(progress * -5) + 9}00`}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.status === AsyncStatus.Pending && (
          <Box ml={1}>
            <SpinLoading size="sm" height={1} color={`gray.${Math.floor(progress * -5) + 9}00`} />
          </Box>
        )}
        {item.status === AsyncStatus.Rejected && (
          <Pressable
            px={1}
            _pressed={{ opacity: 0.5 }}
            onPress={() => handleRetry(item.taskId)}
            onLongPress={() => handleRemove(item.taskId)}
          >
            <Text fontWeight="bold" fontSize="sm" color="red.800">
              {item.fail.length}
            </Text>
          </Pressable>
        )}
      </HStack>
    );
  };

  return (
    <Drawer ref={drawerRef} triggerLabel="下载列表">
      <Box bg="gray.100" h="full">
        {list.length > 0 && (
          <FlashList
            data={list}
            renderItem={renderItem}
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
