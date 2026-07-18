import React, { useMemo, useState, useCallback } from 'react';
import { action, useAppSelector, useAppDispatch } from '~/redux';
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
  const dict = useAppSelector((state) => state.dict.manga);
  const failList = useAppSelector((state) => state.batch.fail);
  const activeList = useAppSelector((state) => state.batch.stack);
  const loadStatus = useAppSelector((state) => state.app.launchStatus);
  const [selectedManga, setSelectedManga] = useState<string[]>([]);
  const [isSelectMode, setSelectMode] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclose();
  const bg = useBackgroundColor();

  const favoriteList = useMemo(
    () => list.map((item) => dict[item.mangaHash]).filter(nonNullable),
    [dict, list]
  );
  const trendList = useMemo(
    () => list.filter((item) => item.isTrend).map((item) => item.mangaHash),
    [list]
  );
  const negativeList = useMemo(
    () => list.filter((item) => !item.enableBatch).map((item) => item.mangaHash),
    [list]
  );

  const handleDetail = (mangaHash: string) => {
    if (isSelectMode) {
      if (selectedManga.includes(mangaHash)) {
        setSelectedManga(selectedManga.filter((hash) => hash !== mangaHash));
      } else {
        setSelectedManga([...selectedManga, mangaHash]);
      }
      return;
    }
    navigate('Detail', { mangaHash });
  };

  const handleSelect = (mangaHash: string) => {
    if (isSelectMode) {
      return;
    }
    setSelectMode(true);
    setSelectedManga([mangaHash]);
  };

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
          <VectorIcon source="materialCommunityIcons" name="window-close" onPress={handleCancel} />
          <VectorIcon
            source="materialCommunityIcons"
            name={
              selectedManga.length <= 0
                ? 'checkbox-blank-outline'
                : selectedManga.length >= list.length
                ? 'checkbox-marked-outline'
                : 'checkbox-intermediate'
            }
            onPress={handleSelectAll}
          />
          <VectorIcon
            name="delete-forever"
            opacity={selectedManga.length <= 0 ? 0.5 : 1}
            disabled={selectedManga.length <= 0}
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
  const { loadStatus: batchStatus, stack, queue, fail } = useAppSelector((state) => state.batch);
  const isUpdating = batchStatus === AsyncStatus.Pending;

  const handleSearch = () => {
    RootNavigation.navigate('Discovery');
  };
  const handlePlugin = () => {
    RootNavigation.navigate('Plugin');
  };
  const handleUpdate = () => {
    dispatch(batchUpdate());
  };

  return (
    <HStack flexShrink={0}>
      <VectorIcon name="search" onPress={handleSearch} />
      <VectorIcon name="settings" onPress={handlePlugin} />
      <View position="relative">
        <VectorIcon isDisabled={isUpdating} name="autorenew" onPress={handleUpdate} />
        {isUpdating && (
          <Text position="absolute" top={0} right={0} color="black" fontWeight="extrabold">
            {queue.length + stack.length}
          </Text>
        )}
        {!isUpdating && fail.length > 0 && (
          <Text position="absolute" top={0} right={0} color="red.400" fontWeight="extrabold">
            {fail.length}
          </Text>
        )}
      </View>
    </HStack>
  );
};

export default Home;
