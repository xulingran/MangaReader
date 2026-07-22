import React from 'react';
import { Button, VStack, Text, Icon } from 'native-base';
import { FallbackProps } from 'react-error-boundary';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useThemePalette } from '~/utils/theme/hooks';

/** 电子墨水版：GIF 改为静态图标 */
const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const palette = useThemePalette();
  return (
    <VStack
      w="full"
      h="full"
      px={1}
      space={1}
      alignItems="center"
      justifyContent="center"
      bg={palette.bg}
    >
      <Icon as={MaterialIcons} name="error-outline" size={16} color={palette.text} />
      <Text color={palette.text} pt={3} pb={1} fontSize="md" fontWeight="bold">
        非常抱歉，应用遇到未知错误:
      </Text>
      <Text fontSize="md" color={palette.text}>
        {error.message}
      </Text>
      <Button variant="link" _text={{ color: palette.text }} size="lg" onPress={resetErrorBoundary}>
        重试
      </Button>
    </VStack>
  );
};

export default ErrorFallback;
