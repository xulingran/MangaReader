import React, { useEffect, useCallback } from 'react';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { useFocusEffect } from '@react-navigation/native';
import { Box, View } from 'native-base';
import { nonNullable, AsyncStatus } from '~/utils';
import SearchOption from '~/components/SearchOption';
import Bookshelf from '~/components/Bookshelf';
import { useThemePalette } from '~/utils/theme/hooks';

const { loadSearch, setSearchFilter } = action;

const Search = ({ route, navigation }: StackSearchProps) => {
  const { keyword, source } = route.params;
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.search.list);
  const filter = useAppSelector((state) => state.search.filter);
  const loadStatus = useAppSelector((state) => state.search.loadStatus);
  // 只订阅搜索结果对应的 manga，并做浅比较；后台更新无关 manga 不触发重渲染
  const searchList = useAppShallowSelector((state) =>
    list.map((hash) => state.dict.manga[hash]).filter(nonNullable)
  );
  const palette = useThemePalette();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: keyword });
    }, [keyword, navigation])
  );
  useEffect(() => {
    dispatch(loadSearch({ keyword, source, isReset: true }));
  }, [dispatch, keyword, source]);

  const handleReload = useCallback(() => {
    dispatch(loadSearch({ keyword, source, isReset: true }));
  }, [dispatch, keyword, source]);
  const handleLoadMore = useCallback(() => {
    dispatch(loadSearch({ keyword, source }));
  }, [dispatch, keyword, source]);
  const handleDetail = useCallback(
    (mangaHash: string) => {
      navigation.push('Detail', { mangaHash });
    },
    [navigation]
  );
  const handleFilterChange = useCallback(
    (name: string, value: string) => {
      dispatch(setSearchFilter({ [name]: value }));
      dispatch(loadSearch({ keyword, source, isReset: true }));
    },
    [dispatch, keyword, source]
  );

  return (
    <View flex={1} bg={palette.bg}>
      <SearchOption source={source} filter={filter} type="search" onChange={handleFilterChange} />
      <Box bg={palette.bg} flex={1}>
        <Bookshelf
          emptyText="没找到相关漫画~"
          list={searchList}
          reload={handleReload}
          loadMore={handleLoadMore}
          itemOnPress={handleDetail}
          loading={loadStatus === AsyncStatus.Pending}
        />
      </Box>
    </View>
  );
};

export default Search;
