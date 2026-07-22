import React from 'react';
import { Center, Text, Pressable, Icon } from 'native-base';
import { ColorType } from 'native-base/lib/typescript/components/types';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useThemePalette } from '~/utils/theme/hooks';

interface EmptyProps {
  bg?: ColorType;
  color?: ColorType;
  text?: string;
  onPress?: () => void;
}

/** 电子墨水版：GIF 改为静态图标 + 文字 */
const Empty = ({ bg, color, text = '', onPress }: EmptyProps) => {
  const palette = useThemePalette();
  return (
    <Center w="full" h="full" safeAreaX safeAreaBottom bg={bg || palette.bg}>
      <Pressable onPress={onPress} alignItems="center">
        <Icon as={MaterialIcons} name="inbox" size={16} color={palette.disabled} />
        {text !== '' && (
          <Text
            color={color || palette.subText}
            textAlign="center"
            fontWeight="bold"
            fontSize="md"
            pt={2}
          >
            {text}
          </Text>
        )}
      </Pressable>
    </Center>
  );
};

export default Empty;
