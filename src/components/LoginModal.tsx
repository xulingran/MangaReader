import React, { useEffect, useState } from 'react';
import { Input, Box } from 'native-base';
import Overlay from './Overlay';
import ModalConfirmButton from './ModalConfirmButton';
import { useThemePalette } from '~/utils/theme/hooks';

interface LoginModalProps {
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: (username: string, password: string) => void;
}

/** 电子墨水版：账号密码登录弹窗，无动画静态覆盖层 */
const LoginModal = ({ title, isOpen = false, onClose, onSubmit }: LoginModalProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const palette = useThemePalette();

  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const account = username.trim();
    if (!account || !password) {
      return;
    }
    onSubmit?.(account, password);
  };

  return (
    <Overlay isOpen={isOpen} title={title} onClose={onClose}>
      <Box p={3}>
        <Input
          w="full"
          fontSize="sm"
          bg={palette.bg}
          color={palette.text}
          borderColor={palette.border}
          placeholderTextColor={palette.placeholderTextColor}
          placeholder="账户名"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <Input
          w="full"
          mt={3}
          fontSize="sm"
          bg={palette.bg}
          color={palette.text}
          borderColor={palette.border}
          placeholderTextColor={palette.placeholderTextColor}
          placeholder="密码"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <ModalConfirmButton label="登录" onPress={handleSubmit} />
      </Box>
    </Overlay>
  );
};

export default LoginModal;
