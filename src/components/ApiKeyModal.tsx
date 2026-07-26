import React, { useEffect, useState } from 'react';
import { Input, Box, Text } from 'native-base';
import Overlay from './Overlay';
import ModalConfirmButton from './ModalConfirmButton';
import { useThemePalette } from '~/utils/theme/hooks';

interface ApiKeyModalProps {
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: (apiKey: string) => void;
}

/** 电子墨水版：API Key 凭据输入弹窗，无动画静态覆盖层 */
const ApiKeyModal = ({ title, isOpen = false, onClose, onSubmit }: ApiKeyModalProps) => {
  const [apiKey, setApiKey] = useState('');
  const palette = useThemePalette();

  useEffect(() => {
    if (isOpen) {
      setApiKey('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const value = apiKey.trim();
    if (!value) {
      return;
    }
    onSubmit?.(value);
  };

  return (
    <Overlay isOpen={isOpen} title={title} onClose={onClose}>
      <Box p={3}>
        <Text color={palette.subText} fontSize="sm" mb={3}>
          在 nhentai 账户设置页（user/settings#apikeys）生成 API Key 后粘贴到此处
        </Text>
        <Input
          w="full"
          fontSize="sm"
          bg={palette.bg}
          color={palette.text}
          borderColor={palette.border}
          placeholderTextColor={palette.placeholderTextColor}
          placeholder="API Key"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={apiKey}
          onChangeText={setApiKey}
        />
        <ModalConfirmButton label="保存" onPress={handleSubmit} />
      </Box>
    </Overlay>
  );
};

export default ApiKeyModal;
