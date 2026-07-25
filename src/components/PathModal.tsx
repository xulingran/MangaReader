import React from 'react';
import { Input, InputGroup, Box } from 'native-base';
import { DEFAULT_ANDROID_DOWNLOAD_PATH } from '~/redux/slice';
import VectorIcon from '~/components/VectorIcon';
import Overlay from './Overlay';
import ModalConfirmButton, { useResettableValue } from './ModalConfirmButton';
import { useThemePalette } from '~/utils/theme/hooks';

interface PathModalProps {
  isOpen?: boolean;
  defaultValue?: string;
  onClose?: (path: string) => void;
}

/** 电子墨水版：Modal 改为无动画静态覆盖层 */
const PathModal = ({ isOpen = true, defaultValue = '', onClose }: PathModalProps) => {
  const [path, setPath] = useResettableValue(defaultValue, isOpen);
  const palette = useThemePalette();

  const handleClose = () => {
    onClose?.(path);
  };
  const handleReset = () => {
    setPath(DEFAULT_ANDROID_DOWNLOAD_PATH);
  };

  return (
    <Overlay isOpen={isOpen} title="漫画导出目录" onClose={handleClose}>
      <Box p={3}>
        <InputGroup w="full">
          <Input
            fontSize="sm"
            flex={1}
            bg={palette.bg}
            color={palette.text}
            borderColor={palette.border}
            placeholderTextColor={palette.placeholderTextColor}
            borderRightWidth={0}
            value={path}
            onChangeText={setPath}
          />
          <VectorIcon
            size="md"
            name="restore"
            color={palette.text}
            borderWidth={1}
            borderColor={palette.border}
            onPress={handleReset}
          />
        </InputGroup>
        <ModalConfirmButton onPress={handleClose} />
      </Box>
    </Overlay>
  );
};

export default PathModal;
