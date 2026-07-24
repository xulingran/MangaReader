import React from 'react';
import { Center, Text, Pressable, Icon } from 'native-base';
import { ColorType } from 'native-base/lib/typescript/components/types';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

interface EmptyProps {
  bg?: ColorType;
  color?: ColorType;
  text?: string;
  onPress?: () => void;
}

/** 电子墨水版：GIF 改为静态图标 + 文字；按压反色作为重试反馈 */
const Empty = ({ bg, color, text = '', onPress }: EmptyProps) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  return (
    <Center w="full" h="full" safeAreaX safeAreaBottom bg={bg || palette.bg}>
      <Pressable
        onPress={onPress}
        alignItems="center"
        px={4}
        py={3}
        borderRadius="md"
        bg={pressed ? palette.selectedBg : 'transparent'}
        {...bind}
      >
        <Icon
          as={MaterialIcons}
          name="inbox"
          size={16}
          color={pressed ? palette.selectedText : palette.disabled}
        />
        {text !== '' && (
          <Text
            color={pressed ? palette.selectedText : color || palette.subText}
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
