import { useSafeAreaFrame } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import { Orientation } from '~/utils';

export const useDebouncedSafeAreaFrame = () => {
  const frame = useDebouncedValue(useSafeAreaFrame(), 1000);

  return useMemo(() => {
    return {
      ...frame,
      orientation: frame.width > frame.height ? Orientation.Landscape : Orientation.Portrait,
    };
  }, [frame]);
};
