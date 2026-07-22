import React, { useEffect, useState } from 'react';
import { Input, InputGroup, Box, Button, Text } from 'native-base';
import { initialState } from '~/redux/slice';
import VectorIcon from '~/components/VectorIcon';
import Overlay from './Overlay';

interface PathModalProps {
  isOpen?: boolean;
  defaultValue?: string;
  onClose?: (path: string) => void;
}

/** 电子墨水版：Modal 改为无动画静态覆盖层 */
const PathModal = ({ isOpen = true, defaultValue = '', onClose }: PathModalProps) => {
  const [path, setPath] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setPath(defaultValue);
    }
  }, [defaultValue, isOpen]);

  const handleClose = () => {
    onClose && onClose(path);
  };
  const handleReset = () => {
    setPath(initialState.setting.androidDownloadPath);
  };

  return (
    <Overlay isOpen={isOpen} title="漫画导出目录" onClose={handleClose}>
      <Box p={3}>
        <InputGroup w="full">
          <Input
            fontSize="sm"
            flex={1}
            bg="white"
            color="black"
            borderRightWidth={0}
            value={path}
            onChangeText={setPath}
          />
          <VectorIcon
            size="md"
            name="restore"
            color="gray.600"
            borderWidth={1}
            borderColor="gray.300"
            onPress={handleReset}
          />
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

export default PathModal;
