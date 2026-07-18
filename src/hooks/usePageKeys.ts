import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { addPageKeyListener, setReaderActive, PageKeyDirection } from '~/utils';

/**
 * 阅读页实体翻页键监听（电子墨水版替代音量键监听）
 * 仅在页面聚焦且开关开启时激活原生拦截，失焦/卸载自动关闭
 */
export const usePageKeys = (callback: (direction: PageKeyDirection) => void, active = true) => {
  useFocusEffect(
    useCallback(() => {
      if (!active) {
        return;
      }
      setReaderActive(true);
      const removeListener = addPageKeyListener(callback);
      return () => {
        removeListener();
        setReaderActive(false);
      };
    }, [callback, active])
  );
};
