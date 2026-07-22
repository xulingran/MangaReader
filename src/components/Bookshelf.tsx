import React, { memo, useCallback, useMemo } from 'react';
import { useDelayRender, useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import { Box, Text, Icon, HStack, VStack, Pressable } from 'native-base';
import { Keyboard, StyleSheet } from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import SpinLoading from '~/components/SpinLoading';
import Loading from '~/components/Loading';
import Empty from '~/components/Empty';
import StaticCachedImage from '~/components/StaticCachedImage';
import { useThemePalette } from '~/utils/theme/hooks';

/** 书架行高（固定）：小封面 + 标题/来源/状态 */
export const BOOKSHELF_ROW_HEIGHT = 112;
const COVER_WIDTH = 64;
const COVER_HEIGHT = 96;

interface BookshelfProps {
  list: Manga[];
  failList?: string[];
  trendList?: string[];
  activeList?: string[];
  negativeList?: string[];
  loadMore?: () => void;
  reload?: () => void;
  itemOnPress: (hash: string) => void;
  loading?: boolean;
  emptyText?: string;
  itemOnLongPress?: (hash: string) => void;
  selectedList?: string[];
  isSelectMode?: boolean;
}

/** 状态统一用「图标 + 文字」表达 */
const statusOf = (
  hash: string,
  extra: {
    fail: string[];
    trend: string[];
    active: string[];
    negative: string[];
  }
): { icon: string; text: string } | null => {
  if (extra.active.includes(hash)) {
    return { icon: 'sync', text: '更新中…' };
  }
  if (extra.fail.includes(hash)) {
    return { icon: 'error-outline', text: '更新失败' };
  }
  if (extra.trend.includes(hash)) {
    return { icon: 'fiber-new', text: '有更新' };
  }
  if (extra.negative.includes(hash)) {
    return { icon: 'lock-outline', text: '已禁用批量更新' };
  }
  return null;
};

const Bookshelf = ({
  list,
  failList,
  trendList,
  activeList,
  negativeList,
  loadMore,
  reload,
  itemOnPress,
  loading = false,
  emptyText,
  selectedList,
  isSelectMode,
  itemOnLongPress,
}: BookshelfProps) => {
  const { width: windowWidth, height: windowHeight } = useDebouncedSafeAreaFrame();
  const insets = useDebouncedSafeAreaInsets();
  const render = useDelayRender(loading && list.length === 0);
  const palette = useThemePalette();
  const extraData = useMemo(
    () => ({
      fail: failList || [],
      trend: trendList || [],
      active: activeList || [],
      negative: negativeList || [],
      selectMode: isSelectMode || false,
      selected: selectedList || [],
      bg: palette.bg,
      text: palette.text,
      subText: palette.subText,
      border: palette.border,
      selectedBg: palette.selectedBg,
      selectedText: palette.selectedText,
      pressedBg: palette.pressedBg,
    }),
    [
      activeList,
      failList,
      isSelectMode,
      negativeList,
      palette,
      selectedList,
      trendList,
    ]
  );

  const handleEndReached = useCallback(() => {
    !loading && loadMore && loadMore();
  }, [loading, loadMore]);

  // 避免 Bookshelf 自身重渲染时重复分配 renderItem；cell 是否重渲染仍由 data/extraData 决定。
  // 项内 onPress/onLongPress 直接调用稳定引用的 itemOnPress/itemOnLongPress，不再生成 per-hash 闭包。
  const renderItem = useCallback(
    ({ item, extraData: extra }: ListRenderItemInfo<Manga>) => {
      const status = statusOf(item.hash, extra);
      const isSelected = extra.selected?.includes(item.hash);
      return (
        <Pressable
          _pressed={{ bg: extra.pressedBg }}
          onPress={() => itemOnPress(item.hash)}
          onLongPress={() => itemOnLongPress?.(item.hash)}
        >
          <HStack
            height={BOOKSHELF_ROW_HEIGHT}
            px={3}
            py={2}
            space={3}
            alignItems="flex-start"
            borderBottomWidth={1}
            borderColor={extra.border}
            bg={isSelected ? extra.selectedBg : extra.bg}
          >
            <Box
              style={styles.cover}
              borderWidth={1}
              borderColor={isSelected ? extra.selectedText : extra.border}
              overflow="hidden"
            >
              <StaticCachedImage
                headers={item.headers}
                source={item.bookCover || item.infoCover || item.cover || ''}
                style={styles.img}
                resizeMode="contain"
              />
            </Box>
            <VStack flex={1} space={1}>
              <HStack alignItems="center" space={1}>
                {extra.selectMode && (
                  <Icon
                    as={MaterialIcons}
                    size="md"
                    name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                    color={isSelected ? extra.selectedText : extra.text}
                  />
                )}
                <Text
                  color={isSelected ? extra.selectedText : extra.text}
                  fontSize="md"
                  fontWeight="bold"
                  numberOfLines={1}
                  flex={1}
                >
                  {item.title || item.hash}
                </Text>
              </HStack>
              <Text
                fontSize="sm"
                color={isSelected ? extra.selectedText : extra.subText}
                numberOfLines={1}
              >
                {item.sourceName}
              </Text>
              {status && !extra.selectMode && (
                <HStack alignItems="center" space={1}>
                  <Icon
                    as={MaterialIcons}
                    size="xs"
                    name={status.icon}
                    color={isSelected ? extra.selectedText : extra.text}
                  />
                  <Text fontSize="xs" color={isSelected ? extra.selectedText : extra.text}>
                    {status.text}
                  </Text>
                </HStack>
              )}
            </VStack>
          </HStack>
        </Pressable>
      );
    },
    [itemOnPress, itemOnLongPress]
  );

  if ((loading && list.length === 0) || !render) {
    return <Loading />;
  }
  if (!loading && list.length === 0) {
    return <Empty bg={palette.bg} text={emptyText} onPress={reload} />;
  }

  return (
    <FlashList
      data={list}
      extraData={extraData}
      estimatedItemSize={BOOKSHELF_ROW_HEIGHT}
      estimatedListSize={{ width: windowWidth, height: windowHeight }}
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      onScroll={Keyboard.dismiss}
      onEndReached={handleEndReached}
      onEndReachedThreshold={1}
      keyExtractor={keyExtractor}
      ListFooterComponent={
        loading ? <SpinLoading height={48} safeAreaBottom /> : <Box safeAreaBottom />
      }
      renderItem={renderItem}
    />
  );
};

const keyExtractor = (item: Manga) => item.hash;

const styles = StyleSheet.create({
  cover: {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
  },
  img: {
    width: '100%',
    height: '100%',
  },
});

export default memo(Bookshelf);
