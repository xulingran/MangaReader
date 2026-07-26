import React, { useEffect, useCallback } from 'react';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { useFocusEffect } from '@react-navigation/native';
import { Box } from 'native-base';
import { nonNullable, AsyncStatus } from '~/utils';
import { PluginMap } from '~/plugins';
import Bookshelf from '~/components/Bookshelf';
import { useThemePalette } from '~/utils/theme/hooks';

const { loadOnlineFavorites } = action;

const OnlineFavorites = ({ route, navigation }: StackOnlineFavoritesProps) => {
  const { source } = route.params;
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.onlineFavorites.list);
  const loadStatus = useAppSelector((state) => state.onlineFavorites.loadStatus);
  // 只订阅在线收藏夹对应的 manga，并做浅比较；后台更新无关 manga 不触发重渲染
  const favoritesList = useAppShallowSelector((state) =>
    list.map((hash) => state.dict.manga[hash]).filter(nonNullable)
  );
  const palette = useThemePalette();
  const sourceName = PluginMap.get(source)?.name || '';

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: `${sourceName}收藏夹` });
    }, [sourceName, navigation])
  );
  useEffect(() => {
    dispatch(loadOnlineFavorites({ source, isReset: true }));
  }, [dispatch, source]);

  const handleReload = useCallback(() => {
    dispatch(loadOnlineFavorites({ source, isReset: true }));
  }, [dispatch, source]);
  const handleLoadMore = useCallback(() => {
    dispatch(loadOnlineFavorites({ source }));
  }, [dispatch, source]);
  const handleDetail = useCallback(
    (mangaHash: string) => {
      navigation.push('Detail', { mangaHash });
    },
    [navigation]
  );

  return (
    <Box flex={1} bg={palette.bg}>
      <Bookshelf
        emptyText="收藏夹是空的，或尚未登录~"
        list={favoritesList}
        reload={handleReload}
        loadMore={handleLoadMore}
        itemOnPress={handleDetail}
        loading={loadStatus === AsyncStatus.Pending}
      />
    </Box>
  );
};

export default OnlineFavorites;
