import React from 'react';
import { Center, Text, Pressable, Icon } from 'native-base';
import { ColorType } from 'native-base/lib/typescript/components/types';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface EmptyProps {
  bg?: ColorType;
  color?: ColorType;
  text?: string;
  onPress?: () => void;
}

/** 电子墨水版：GIF 改为静态图标 + 文字 */
const Empty = ({ bg = 'white', color = 'gray.600', text = '', onPress }: EmptyProps) => {
  return (
    <Center w="full" h="full" safeAreaX safeAreaBottom bg={bg}>
      <Pressable onPress={onPress} alignItems="center">
        <Icon as={MaterialIcons} name="inbox" size={16} color="gray.400" />
        {text !== '' && (
          <Text color={color} textAlign="center" fontWeight="bold" fontSize="md" pt={2}>
            {text}
          </Text>
        )}
      </Pressable>
    </Center>
  );
};

export default Empty;
