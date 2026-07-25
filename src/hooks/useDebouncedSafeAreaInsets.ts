import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebouncedValue } from './useDebouncedValue';

export const useDebouncedSafeAreaInsets = () => {
  return useDebouncedValue(useSafeAreaInsets(), 200);
};
