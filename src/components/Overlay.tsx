import React, { memo, ReactNode } from 'react';
import { Box, HStack, Text, Pressable, Icon } from 'native-base';
import { Modal as RNModal } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface OverlayProps {
  isOpen?: boolean;
  title?: string;
  onClose?: () => void;
  children?: ReactNode;
}

/**
 * 电子墨水版静态覆盖层：无动画（animationType="none"）、无透明遮罩
 * 全屏不透明白底 + 顶部标题栏，瞬时开合
 */
const Overlay = ({ isOpen = false, title, onClose, children }: OverlayProps) => {
  return (
    <RNModal
      visible={isOpen}
      animationType="none"
      transparent={false}
      onRequestClose={() => onClose && onClose()}
    >
      <Box flex={1} bg="white" safeArea>
        <HStack
          w="full"
          px={2}
          py={1}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderColor="black"
        >
          <Text flex={1} fontSize="lg" fontWeight="bold" numberOfLines={1}>
            {title || ''}
          </Text>
          <Pressable p={2} onPress={onClose} accessibilityLabel="关闭">
            <Icon as={MaterialIcons} name="close" size="lg" color="black" />
          </Pressable>
        </HStack>
        <Box flex={1}>{children}</Box>
      </Box>
    </RNModal>
  );
};

export default memo(Overlay);
