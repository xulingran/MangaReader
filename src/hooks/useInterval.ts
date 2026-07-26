import { useEffect, useRef } from 'react';

export const useInterval = (callback: () => void, enable = true, ms = 5000) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const fn = () => {
      // callback 抛错不应静默终止定时翻页链：记录后仍继续排下一次。
      // 仅在 __DEV__ 下打印，避免线上日志噪声。
      try {
        callback();
      } catch (error) {
        if (__DEV__) {
          console.warn('useInterval callback error:', error);
        }
      }
      // cleanup 会把 ref 置为 undefined；callback 同步触发卸载时不再重排，
      // 避免定时链在组件卸载后继续存活。
      if (timeoutRef.current !== undefined) {
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
