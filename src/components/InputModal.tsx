import React, { useState } from 'react';
import { Text, Input, InputGroup, InputRightAddon, Button, Box } from 'native-base';
import { KeyboardTypeOptions } from 'react-native';
import Overlay from './Overlay';

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
            bg="white"
            color="black"
            value={value}
            keyboardType={keyboardType}
            onChangeText={setValue}
          />
          {rightAddon && <InputRightAddon px={2} children={rightAddon} background="gray.100" />}
        </InputGroup>
        <Button mt={3} colorScheme="gray" onPress={handleClose}>
          <Text color="white" fontWeight="bold">
            确定
          </Text>
        </Button>
      </Box>
    </Overlay>
  );
};

export default InputModal;
