import React, { memo, ReactNode } from 'react';
import { Box, HStack, Text, Pressable, Icon } from 'native-base';
import { Modal as RNModal } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

interface OverlayProps {
  isOpen?: boolean;
  title?: string;
  onClose?: () => void;
  children?: ReactNode;
}

/**
 * 电子墨水版静态覆盖层：无动画（animationType="none"）、无透明遮罩
 * 全屏不透明主题背景 + 顶部标题栏，瞬时开合；关闭按钮按压反色
 */
const Overlay = ({ isOpen = false, title, onClose, children }: OverlayProps) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  // RN Modal 一旦打开过 isRendered 就永久为 true，关闭后整棵子树仍参与每次 reconciliation；
  // 电子墨水版无关闭动画，关闭时直接卸载，避免阅读页翻页时白跑弹窗子树的 diff
  if (!isOpen) {
    return null;
  }
  return (
    <RNModal
      visible={isOpen}
      animationType="none"
      transparent={false}
      onRequestClose={onClose}
    >
      <Box flex={1} bg={palette.bg} safeArea>
        <HStack
          w="full"
          px={2}
          py={1}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderColor={palette.border}
        >
          <Text flex={1} color={palette.text} fontSize="lg" fontWeight="bold" numberOfLines={1}>
            {title || ''}
          </Text>
          <Pressable
            p={2}
            borderRadius="full"
            bg={pressed ? palette.selectedBg : 'transparent'}
            {...bind}
            onPress={onClose}
            accessibilityLabel="关闭"
          >
            <Icon
              as={MaterialIcons}
              name="close"
              size="lg"
              color={pressed ? palette.selectedText : palette.text}
            />
          </Pressable>
        </HStack>
        <Box flex={1}>{children}</Box>
      </Box>
    </RNModal>
  );
};

export default memo(Overlay);
