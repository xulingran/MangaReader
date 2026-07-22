import React, { useEffect, useState } from 'react';
import { Text, Input, InputGroup, InputRightAddon, Button, Box } from 'native-base';
import { KeyboardTypeOptions } from 'react-native';
import Overlay from './Overlay';
import { useThemePalette } from '~/utils/theme/hooks';

interface InputModalProps {
  title?: string;
  isOpen?: boolean;
  rightAddon?: string;
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
  onClose?: (value: string) => void;
}

/** 电子墨水版：Modal 改为无动画静态覆盖层 */
const InputModal = ({
  title,
  isOpen = true,
  rightAddon,
  defaultValue = '',
  keyboardType,
  onClose,
}: InputModalProps) => {
  const [value, setValue] = useState(defaultValue);
  const palette = useThemePalette();

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [defaultValue, isOpen]);

  const handleClose = () => {
    onClose && onClose(value);
  };

  return (
    <Overlay isOpen={isOpen} title={title} onClose={handleClose}>
      <Box p={3}>
        <InputGroup w="full">
          <Input
            flex={1}
            fontSize="sm"
            bg={palette.bg}
            color={palette.text}
            borderColor={palette.border}
            placeholderTextColor={palette.placeholderTextColor}
            value={value}
            keyboardType={keyboardType}
            onChangeText={setValue}
          />
          {rightAddon && (
            <InputRightAddon
              px={2}
              children={rightAddon}
              background={palette.card}
              borderColor={palette.border}
              _text={{ color: palette.text }}
            />
          )}
        </InputGroup>
        <Button
          mt={3}
          bg={palette.selectedBg}
          borderWidth={1}
          borderColor={palette.border}
          _pressed={{ bg: palette.selectedBg }}
          onPress={handleClose}
        >
          <Text color={palette.selectedText} fontWeight="bold">
            确定
          </Text>
        </Button>
      </Box>
    </Overlay>
  );
};

export default InputModal;
