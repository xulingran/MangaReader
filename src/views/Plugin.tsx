import React from 'react';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { Box, Text, VStack, HStack, ScrollView } from 'native-base';
import { useDebouncedSafeAreaInsets } from '~/hooks';
import { Plugin as PluginType } from '~/plugins';
import ScoreRate from '~/components/ScoreRate';
import VectorIcon from '~/components/VectorIcon';
import { useThemePalette } from '~/utils/theme/hooks';

const { sortPlugin, disablePlugin } = action;

const Plugin = ({ navigation: { navigate } }: StackPluginProps) => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.plugin.list);
  const { left, right, bottom } = useDebouncedSafeAreaInsets();
  const palette = useThemePalette();

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= list.length) {
      return;
    }
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    dispatch(sortPlugin(next));
  };

  return (
    <Box flex={1} bg={palette.bg}>
      <ScrollView contentContainerStyle={{ paddingLeft: left, paddingRight: right, paddingBottom: bottom }}>
        {list.map((item, index) => (
          <HStack
            key={item.value}
            space={3}
            alignItems="center"
            px={4}
            py={3}
            borderBottomWidth={1}
            borderColor={palette.border}
          >
            <VStack space={1} flexGrow={1} w={0}>
              <Text
                fontSize="lg"
                fontWeight="bold"
                color={palette.text}
                accessibilityRole="link"
                onPress={() =>
                  navigate('Webview', {
                    uri: item.href,
                    source: item.value,
                    userAgent: item.userAgent,
                    injectedJavascript: item.injectedJavaScript,
                  })
                }
                textDecorationLine={item.disabled ? 'line-through' : 'none'}
              >
                {item.name} - {item.label} 🔗
              </Text>
              {item.description && (
                <Text color={palette.subText} fontSize="sm">
                  {item.description}
                </Text>
              )}
              <HStack alignItems="center">
                <Text color={palette.text} fontSize="sm">
                  推荐指数：
                </Text>
                <ScoreRate score={item.score} />
              </HStack>
            </VStack>
            <VStack>
              <VectorIcon
                name="keyboard-arrow-up"
                size="lg"
                disabled={index === 0}
                accessibilityLabel="上移来源"
                accessibilityState={{ disabled: index === 0 }}
                onPress={() => move(index, -1)}
              />
              <VectorIcon
                name="keyboard-arrow-down"
                size="lg"
                disabled={index === list.length - 1}
                accessibilityLabel="下移来源"
                accessibilityState={{ disabled: index === list.length - 1 }}
                onPress={() => move(index, 1)}
              />
            </VStack>
            <VectorIcon
              name={item.disabled ? 'check-box-outline-blank' : 'check-box'}
              size="lg"
              accessibilityLabel={item.disabled ? '启用来源' : '停用来源'}
              accessibilityState={{ checked: !item.disabled }}
              onPress={() => dispatch(disablePlugin(item.value as PluginType))}
            />
          </HStack>
        ))}
      </ScrollView>
    </Box>
  );
};

export default Plugin;
