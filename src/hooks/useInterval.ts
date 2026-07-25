import { useEffect, useRef } from 'react';

export const useInterval = (callback: () => void, enable = true, ms = 5000) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const fn = () => {
      if (enable) {
        callback();
        timeoutRef.current = setTimeout(fn, ms);
      }
    };

    if (enable) {
      timeoutRef.current = setTimeout(fn, ms);
    }
    return () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    };
  }, [callback, enable, ms]);
};
