import React, { useMemo, useState, useCallback } from 'react';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { nonNullable, AsyncStatus } from '~/utils';
import { View, Text, HStack, Button, useDisclose } from 'native-base';
import { useFocusEffect } from '@react-navigation/native';
import { useBackgroundColor } from '~/utils/theme/hooks';
import VectorIcon from '~/components/VectorIcon';
import Bookshelf from '~/components/Bookshelf';
import Overlay from '~/components/Overlay';
import * as RootNavigation from '~/utils/navigation';

const { batchUpdate, removeFavorites } = action;

const Home = ({ navigation: { navigate, setOptions } }: StackHomeProps) => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.favorites);
  const failList = useAppSelector((state) => state.batch.fail);
  const activeList = useAppSelector((state) => state.batch.stack);
  const loadStatus = useAppSelector((state) => state.app.launchStatus);
  const [selectedManga, setSelectedManga] = useState<string[]>([]);
  const [isSelectMode, setSelectMode] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclose();
  const bg = useBackgroundColor();

  // 只订阅收藏列表中的 manga，并做浅比较；后台 batchUpdate 更新非收藏漫画不触发重渲染
  const favoriteList = useAppShallowSelector((state) =>
    list.map((item) => state.dict.manga[item.mangaHash]).filter(nonNullable)
  );
  const trendList = useMemo(
    () => list.filter((item) => item.isTrend).map((item) => item.mangaHash),
    [list]
  );
  const negativeList = useMemo(
    () => list.filter((item) => !item.enableBatch).map((item) => item.mangaHash),
    [list]
  );

  const handleDetail = useCallback(
    (mangaHash: string) => {
      if (isSelectMode) {
        setSelectedManga((prev) =>
          prev.includes(mangaHash) ? prev.filter((hash) => hash !== mangaHash) : [...prev, mangaHash]
        );
        return;
      }
      navigate('Detail', { mangaHash });
    },
    [isSelectMode, navigate]
  );

  const handleSelect = useCallback(
    (mangaHash: string) => {
      if (isSelectMode) {
        return;
      }
      setSelectMode(true);
      setSelectedManga([mangaHash]);
    },
    [isSelectMode]
  );

  const handleCancel = useCallback(() => {
    setSelectMode(false);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedManga.length === list.length) {
      setSelectedManga([]);
      return;
    }
    setSelectedManga(list.map((item) => item.mangaHash));
  }, [list, selectedManga]);

  const handleDelete = useCallback(() => {
    dispatch(removeFavorites(selectedManga));
    onClose();
  }, [dispatch, onClose, selectedManga]);

  const renderHeaderRight = useCallback(() => {
    if (isSelectMode) {
      return (
        <HStack flexShrink={0}>
          <VectorIcon
            source="materialCommunityIcons"
            name="window-close"
            accessibilityLabel="退出多选"
            onPress={handleCancel}
          />
          <VectorIcon
            source="materialCommunityIcons"
            name={
              selectedManga.length <= 0
                ? 'checkbox-blank-outline'
                : selectedManga.length >= list.length
                ? 'checkbox-marked-outline'
                : 'checkbox-intermediate'
            }
            accessibilityLabel="全选或取消全选漫画"
            accessibilityState={{
              checked:
                selectedManga.length <= 0
                  ? false
                  : selectedManga.length >= list.length
                    ? true
                    : 'mixed',
            }}
            onPress={handleSelectAll}
          />
          <VectorIcon
            name="delete-forever"
            opacity={selectedManga.length <= 0 ? 0.5 : 1}
            disabled={selectedManga.length <= 0}
            accessibilityLabel="删除所选漫画"
            onPress={onOpen}
          />
        </HStack>
      );
    }
    return <SearchAndAbout />;
  }, [list, selectedManga, isSelectMode, handleCancel, handleSelectAll, onOpen]);

  useFocusEffect(
    useCallback(() => {
      setOptions({ headerRight: renderHeaderRight });
    }, [renderHeaderRight, setOptions])
  );

  return (
    <View flex={1} bg={bg}>
      <Bookshelf
        emptyText="漫画收藏为空~"
        list={favoriteList}
        failList={failList}
        trendList={trendList}
        activeList={activeList}
        negativeList={negativeList}
        selectedList={selectedManga}
        isSelectMode={isSelectMode}
        itemOnPress={handleDetail}
        itemOnLongPress={handleSelect}
        loading={loadStatus === AsyncStatus.Pending}
      />
      <Overlay isOpen={isOpen} title="确认" onClose={onClose}>
        <View p={4}>
          <Text color="black" fontSize="md">
            从列表删除所选漫画？
          </Text>
          <Button.Group size="sm" space="sm" mt={4} justifyContent="flex-end">
            <Button px={5} variant="outline" colorScheme="gray" onPress={onClose}>
              取消
            </Button>
            <Button px={5} colorScheme="gray" onPress={handleDelete}>
              确认
            </Button>
          </Button.Group>
        </View>
      </Overlay>
    </View>
  );
};

export const SearchAndAbout = () => {
  const dispatch = useAppDispatch();
  // 细粒度订阅：saga 推进 batch 队列时只让真正变化的字段触发重渲染，而不是整个 batch slice
  const batchStatus = useAppSelector((state) => state.batch.loadStatus);
  const stackLength = useAppSelector((state) => state.batch.stack.length);
  const queueLength = useAppSelector((state) => state.batch.queue.length);
  const failLength = useAppSelector((state) => state.batch.fail.length);
  const isUpdating = batchStatus === AsyncStatus.Pending;

  const handleSearch = useCallback(() => {
    RootNavigation.navigate('Discovery');
  }, []);
  const handlePlugin = useCallback(() => {
    RootNavigation.navigate('Plugin');
  }, []);
  const handleUpdate = useCallback(() => {
    dispatch(batchUpdate());
  }, [dispatch]);

  return (
    <HStack flexShrink={0}>
      <VectorIcon name="search" accessibilityLabel="搜索漫画" onPress={handleSearch} />
      <VectorIcon name="settings" accessibilityLabel="管理漫画来源" onPress={handlePlugin} />
      <View position="relative">
        <VectorIcon
          isDisabled={isUpdating}
          name="autorenew"
          accessibilityLabel="更新收藏漫画"
          accessibilityState={{ disabled: isUpdating, busy: isUpdating }}
          onPress={handleUpdate}
        />
        {isUpdating && (
          <Text position="absolute" top={0} right={0} color="black" fontWeight="extrabold">
            {queueLength + stackLength}
          </Text>
        )}
        {!isUpdating && failLength > 0 && (
          <Text position="absolute" top={0} right={0} color="red.400" fontWeight="extrabold">
            {failLength}
          </Text>
        )}
      </View>
    </HStack>
  );
};

export default Home;
