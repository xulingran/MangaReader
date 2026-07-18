import React from 'react';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { Box, Text, VStack, HStack, Switch } from 'native-base';
import { useDebouncedSafeAreaInsets } from '~/hooks';
import { Plugin as PluginType } from '~/plugins';
import { TouchableOpacity } from 'react-native';
import ScoreRate from '~/components/ScoreRate';
import { useBackgroundColor } from '~/utils/theme/hooks';

const { sortPlugin, disablePlugin } = action;

const Plugin = ({ navigation: { navigate } }: StackPluginProps) => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.plugin.list);
  const { left, right, bottom } = useDebouncedSafeAreaInsets();
  const bg = useBackgroundColor();

  const handleToggle = (plugin: PluginType) => {
    dispatch(disablePlugin(plugin));
  };
  const renderItem = ({ item, drag, isActive }: RenderItemParams<(typeof list)[0]>) => (
    <TouchableOpacity onLongPress={drag} disabled={isActive}>
      <HStack
        space={6}
        key={item.value}
        alignItems="center"
        flexDirection="row"
        px={4}
        py={3}
        borderBottomWidth={1}
        borderColor="gray.200"
      >
        <VStack space={1} flexGrow={1} w={0}>
          <Text
            fontSize="lg"
            fontWeight="bold"
            color="black"
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
          {item.description && <Text fontSize="sm">{item.description}</Text>}
          <HStack alignItems="center">
            <Text fontSize="sm">推荐指数：</Text>
            <ScoreRate score={item.score} />
          </HStack>
        </VStack>
        <Switch
          size="md"
          onTrackColor="gray.500"
          value={!item.disabled}
          onToggle={() => handleToggle(item.value)}
        />
      </HStack>
    </TouchableOpacity>
  );

  return (
    <Box position="relative" bg={bg}>
      <DraggableFlatList
        data={list}
        renderItem={renderItem}
        keyExtractor={(item) => item.value}
        onDragEnd={({ data }) => dispatch(sortPlugin(data))}
        contentContainerStyle={{ paddingLeft: left, paddingRight: right, paddingBottom: bottom }}
      />
      {/* for navigation gesture go back */}
      <Box w={4} position="absolute" top={0} bottom={0} left={left} bg="transparent" />
    </Box>
  );
};

export default Plugin;
