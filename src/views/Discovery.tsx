import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Input, Button, HStack, useDisclose } from 'native-base';
import { action, useAppSelector, useAppShallowSelector, useAppDispatch } from '~/redux';
import { useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { nonNullable, AsyncStatus } from '~/utils';
import { Plugin } from '~/plugins';
import { Keyboard } from 'react-native';
import ActionsheetSelect from '~/components/ActionsheetSelect';
import SearchOption from '~/components/SearchOption';
import VectorIcon from '~/components/VectorIcon';
import Bookshelf from '~/components/Bookshelf';
import * as RootNavigation from '~/utils/navigation';
import { useThemePalette } from '~/utils/theme/hooks';

const { loadDiscovery, setSource, setDiscoveryFilter, resetSearchFilter } = action;

const Discovery = ({ navigation }: StackDiscoveryProps) => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.discovery.list);
  const source = useAppSelector((state) => state.plugin.source);
  const filter = useAppSelector((state) => state.discovery.filter);
  const loadStatus = useAppSelector((state) => state.discovery.loadStatus);
  // 只订阅本页可见的 hash 对应 manga，并做浅比较，避免后台 batchUpdate 更新其他漫画时触发重渲染
  const updateList = useAppShallowSelector((state) =>
    list.map((hash) => state.dict.manga[hash]).filter(nonNullable)
  );
  const palette = useThemePalette();

  useFocusEffect(
    useCallback(() => {
      loadStatus === AsyncStatus.Default && dispatch(loadDiscovery({ isReset: true, source }));
    }, [dispatch, loadStatus, source])
  );

  const handleReload = useCallback(() => {
    dispatch(loadDiscovery({ source, isReset: true }));
  }, [dispatch, source]);
  const handleLoadMore = useCallback(() => {
    dispatch(loadDiscovery({ source }));
  }, [dispatch, source]);
  const handleDetail = useCallback(
    (mangaHash: string) => {
      navigation.push('Detail', { mangaHash });
    },
    [navigation]
  );
  const handleFilterChange = useCallback(
    (name: string, value: string) => {
      dispatch(setDiscoveryFilter({ [name]: value }));
      dispatch(loadDiscovery({ source, isReset: true }));
    },
    [dispatch, source]
  );

  return (
    <View flex={1} bg={palette.bg}>
      <SearchOption source={source} filter={filter} type="discovery" onChange={handleFilterChange} />
      <Bookshelf
        emptyText="没找到相关漫画~"
        list={updateList}
        reload={handleReload}
        loadMore={handleLoadMore}
        itemOnPress={handleDetail}
        loading={loadStatus === AsyncStatus.Pending}
      />
    </View>
  );
};

export const PluginSelect = () => {
  const { isOpen, onOpen: handleOpen, onClose: handleClose } = useDisclose();
  const source = useAppSelector((state) => state.plugin.source);
  const list = useAppSelector((state) => state.plugin.list);
  const route = useRoute<RouteProp<RootStackParamList, 'Discovery' | 'Search'>>();
  const dispatch = useAppDispatch();
  const palette = useThemePalette();
  const options = useMemo<{ label: string; value: Plugin }[]>(() => {
    return list
      .filter((item) => !item.disabled)
      .map((item) => ({ label: `${item.name} - ${item.label}`, value: item.value }));
  }, [list]);
  const plugin = useMemo(() => {
    if (route.name === 'Discovery') {
      return source;
    }
    if (route.name === 'Search') {
      return route.params?.source;
    }
    return source;
  }, [route.name, route.params?.source, source]);
  const pluginLabel = useMemo(() => {
    return list.find((item) => item.value === plugin)?.label || plugin;
  }, [list, plugin]);

  const handleChange = (newValue: string) => {
    // value 一定来自 options，反查拿回 Plugin 类型，避免 as 断言
    const newSource = options.find((item) => item.value === newValue)?.value;
    if (!newSource) {
      return;
    }
    if (route.name === 'Discovery') {
      dispatch(setSource(newSource));
    }
    if (route.name === 'Search') {
      dispatch(resetSearchFilter());
      RootNavigation.setParams({ source: newSource });
    }
  };
  const handleSetting = () => {
    handleClose();
    RootNavigation.navigate('Plugin');
  };

  return (
    <View>
      <Button
        p={0}
        mr={1}
        w={12}
        h={12}
        variant="ghost"
        _text={{
          color: palette.text,
          textAlign: 'center',
          fontSize: 'sm',
          fontWeight: 'bold',
        }}
        onPress={() => {
          handleOpen();
          Keyboard.dismiss();
        }}
      >
        {pluginLabel}
      </Button>
      <ActionsheetSelect
        isOpen={isOpen}
        options={options}
        onClose={handleClose}
        onChange={handleChange}
        headerComponent={
          <HStack w="full" pl={4} alignItems="center" justifyContent="space-between">
            <Text color={palette.subText} fontSize={16}>
              选择插件
            </Text>
            <VectorIcon
              name="settings"
              size="lg"
              color={palette.subText}
              label="筛选"
              accessibilityLabel="设置发现页筛选条件"
              onPress={handleSetting}
            />
          </HStack>
        }
      />
    </View>
  );
};

export const SearchAndPlugin = () => {
  const [keyword, setKeyword] = useState('');
  const source = useAppSelector((state) => state.plugin.source);
  const palette = useThemePalette();

  const handleSearch = () => {
    RootNavigation.navigate('Search', { keyword, source });
  };

  return (
    <HStack space={1} flex={1} alignItems="center">
      <Input
        pl={1}
        w={0}
        flex={1}
        size="xl"
        bg={palette.bg}
        color={palette.text}
        borderColor={palette.border}
        variant="underlined"
        placeholder="请输入漫画名"
        placeholderTextColor={palette.placeholderTextColor}
        onChangeText={setKeyword}
        onSubmitEditing={handleSearch}
      />
      <PluginSelect />
    </HStack>
  );
};

export default Discovery;
