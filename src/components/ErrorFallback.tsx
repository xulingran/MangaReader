import React from 'react';
import { Button, VStack, Text, Icon } from 'native-base';
import { FallbackProps } from 'react-error-boundary';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

/** 电子墨水版：GIF 改为静态图标 */
const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <VStack
      w="full"
      h="full"
      px={1}
      space={1}
      alignItems="center"
      justifyContent="center"
      bg="white"
    >
      <Icon as={MaterialIcons} name="error-outline" size={16} color="black" />
      <Text pt={3} pb={1} fontSize="md" fontWeight="bold">
        非常抱歉，应用遇到未知错误:
      </Text>
      <Text fontSize="md" color="red.500">
        {error.message}
      </Text>
      <Button variant="link" size="lg" onPress={resetErrorBoundary}>
        重试
      </Button>
    </VStack>
  );
};

export default ErrorFallback;
