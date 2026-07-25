import { useEffect, useState } from 'react';

export const useDebouncedValue = <T>(value: T, ms: number) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timeout);
    };
  }, [value, ms]);

  return debounced;
};
