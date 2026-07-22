import React, { useState } from 'react';
import { ColorType, SizeType, SafeAreaProps } from 'native-base/lib/typescript/components/types';
import { Center } from 'native-base';
import VectorIcon from '~/components/VectorIcon';

interface ErrorWithRetryProps extends SafeAreaProps {
  color?: ColorType;
  height?: SizeType;
  onRetry?: () => void | Promise<void>;
}

const ErrorWithRetry = ({
  color = 'black',
  height = 48,
  onRetry,
  ...safeAreaProps
}: ErrorWithRetryProps) => {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Center w="full" h={height} bg="transparent" {...safeAreaProps}>
      <VectorIcon
        name="replay"
        size="2xl"
        color={color}
        onPress={handleRetry}
        isDisabled={retrying}
        accessibilityState={{ disabled: retrying, busy: retrying }}
        accessibilityLabel="重新加载"
      />
    </Center>
  );
};

export default ErrorWithRetry;
