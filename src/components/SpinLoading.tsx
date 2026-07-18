import React from 'react';
import { ColorType, SizeType, SafeAreaProps } from 'native-base/lib/typescript/components/types';
import { Center, Text } from 'native-base';

interface SpinLoadingProps extends SafeAreaProps {
  size?: 'lg' | 'sm';
  color?: ColorType;
  height?: SizeType;
}

/** 电子墨水版：旋转 Spinner 改为静态文字 */
const SpinLoading = ({
  size = 'lg',
  color = 'gray.600',
  height = 48,
  ...safeAreaProps
}: SpinLoadingProps) => {
  return (
    <Center w="full" h={height} {...safeAreaProps}>
      <Text color={color} fontSize={size === 'lg' ? 'md' : 'sm'}>
        加载中…
      </Text>
    </Center>
  );
};

export default SpinLoading;
