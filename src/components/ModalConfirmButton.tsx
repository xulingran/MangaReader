import React, { useEffect, useState } from 'react';
import { Text, Button } from 'native-base';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

/**
 * Modal 打开时重置为默认值的输入状态（InputModal / PathModal 共用）。
 * isOpen 变为 true 时把 value 重置回 defaultValue。
 */
export function useResettableValue(defaultValue: string, isOpen: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [defaultValue, isOpen]);

  return [value, setValue] as const;
}

interface ModalConfirmButtonProps {
  label?: string;
  onPress: () => void;
}

/** 弹窗确认按钮：按压瞬时反色，无动画 */
const ModalConfirmButton = ({ label = '确定', onPress }: ModalConfirmButtonProps) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();

  return (
    <Button
      mt={3}
      bg={pressed ? palette.bg : palette.selectedBg}
      borderWidth={1}
      borderColor={palette.border}
      _pressed={{ bg: palette.bg }}
      {...bind}
      onPress={onPress}
    >
      <Text color={pressed ? palette.text : palette.selectedText} fontWeight="bold">
        {label}
      </Text>
    </Button>
  );
};

export default ModalConfirmButton;
