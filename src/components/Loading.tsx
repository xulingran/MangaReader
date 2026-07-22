import React from 'react';
import { Center, Text, Icon } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useThemePalette } from '~/utils/theme/hooks';

/** 电子墨水版：GIF 改为静态图标 + 文字 */
const Loading = () => {
  const palette = useThemePalette();
  return (
    <Center w="full" h="full" safeAreaX safeAreaBottom bg={palette.bg}>
      <Icon as={MaterialIcons} name="auto-stories" size={16} color={palette.disabled} />
      <Text color={palette.subText} fontWeight="bold" fontSize="md" pt={2}>
        加载中…
      </Text>
    </Center>
  );
};

export default Loading;
