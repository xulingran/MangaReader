import React from 'react';
import { Center, Text, Icon } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

/** 电子墨水版：GIF 改为静态图标 + 文字 */
const Loading = () => {
  return (
    <Center w="full" h="full" safeAreaX safeAreaBottom>
      <Icon as={MaterialIcons} name="auto-stories" size={16} color="gray.400" />
      <Text color="gray.600" fontWeight="bold" fontSize="md" pt={2}>
        加载中…
      </Text>
    </Center>
  );
};

export default Loading;
