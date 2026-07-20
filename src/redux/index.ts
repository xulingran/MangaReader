import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { useRef } from 'react';
import { action, reducer } from './slice';
import saga from './saga';
import store from './store';

const useAppDispatch = () => useDispatch<typeof store.dispatch>();
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * 浅比较包装的 selector：当返回值是数组或对象时，仅在浅比较不等时返回新引用，
 * 避免内联 selector 每次返回新数组触发组件重渲染。react-redux 8.1.3 未内置 useShallow，
 * 这里用 useRef 缓存上一次结果实现等价语义。
 */
export function useAppShallowSelector<T>(selector: (state: RootState) => T): T {
  const value = useSelector(selector);
  const ref = useRef<T>(value);
  if (!shallowEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (
      !Object.prototype.hasOwnProperty.call(b as Record<string, unknown>, key) ||
      !Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }
  return true;
}

export { action, reducer, store, saga, useAppSelector, useAppDispatch };
