import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';

export const useDebouncedSafeAreaInsets = () => {
  const _insets = useSafeAreaInsets();
  const [insets, setInsets] = useState<EdgeInsets>({ ..._insets });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setInsets({ ..._insets });
    }, 200);
    return () => {
      clearTimeout(timeout);
    };
  }, [_insets]);

  return insets;
};
