import React from 'react';
import { Input, InputGroup, InputRightAddon, Box } from 'native-base';
import { KeyboardTypeOptions } from 'react-native';
import Overlay from './Overlay';
import ModalConfirmButton, { useResettableValue } from './ModalConfirmButton';
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
  const [value, setValue] = useResettableValue(defaultValue, isOpen);
  const palette = useThemePalette();

  const handleClose = () => {
    onClose?.(value);
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
              background={palette.card}
              borderColor={palette.border}
              _text={{ color: palette.text }}
            >
              {rightAddon}
            </InputRightAddon>
          )}
        </InputGroup>
        <ModalConfirmButton onPress={handleClose} />
      </Box>
    </Overlay>
  );
};

export default InputModal;
