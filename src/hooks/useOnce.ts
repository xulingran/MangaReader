import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useLatest } from './useLatest';

export const useOnce = (fn: () => void) => {
  const firstRender = useRef(true);
  const latestFn = useLatest(fn);

  useFocusEffect(
    useCallback(() => {
      if (firstRender.current) {
        latestFn.current();
        firstRender.current = false;
      }
    }, [latestFn])
  );
};
