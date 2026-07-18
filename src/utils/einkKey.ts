import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * 电子墨水实体翻页键桥接（对应原生 EInkKeyModule）
 * 仅在阅读页激活，事件载荷为 { direction: 'previous' | 'next' }
 * 原生模块缺失（如 jest 环境）时静默降级为空实现
 */

export type PageKeyDirection = 'previous' | 'next';

interface EInkKeyModuleType {
  setReaderActive: (active: boolean) => void;
}

const { EInkKeyModule } = NativeModules as { EInkKeyModule?: EInkKeyModuleType };
const emitter = EInkKeyModule ? new NativeEventEmitter(NativeModules.EInkKeyModule as any) : null;

export const setReaderActive = (active: boolean) => {
  EInkKeyModule && EInkKeyModule.setReaderActive(active);
};

export const addPageKeyListener = (callback: (direction: PageKeyDirection) => void) => {
  if (!emitter) {
    return () => {};
  }
  const subscription = emitter.addListener('pageKey', (payload: { direction: string }) => {
    if (payload.direction === 'previous' || payload.direction === 'next') {
      callback(payload.direction);
    }
  });
  return () => subscription.remove();
};
