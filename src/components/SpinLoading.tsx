import React from 'react';
import { ColorType, SizeType, SafeAreaProps } from 'native-base/lib/typescript/components/types';
import { Center, Text } from 'native-base';
import { useSubTextColor } from '~/utils/theme/hooks';

interface SpinLoadingProps extends SafeAreaProps {
  size?: 'lg' | 'sm';
  color?: ColorType;
  height?: SizeType;
}

/** 电子墨水版：旋转 Spinner 改为静态文字 */
const SpinLoading = ({
  size = 'lg',
  color,
  height = 48,
  ...safeAreaProps
}: SpinLoadingProps) => {
  const subTextColor = useSubTextColor();
  return (
    <Center w="full" h={height} {...safeAreaProps}>
      <Text color={color || subTextColor} fontSize={size === 'lg' ? 'md' : 'sm'}>
        加载中…
      </Text>
    </Center>
  );
};

export default SpinLoading;
