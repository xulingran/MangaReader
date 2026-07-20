import {
  TypedUseSelectorHook,
  useDispatch,
  useSelector,
  shallowEqual,
} from 'react-redux';
import { action, reducer } from './slice';
import saga from './saga';
import store from './store';

const useAppDispatch = () => useDispatch<typeof store.dispatch>();
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * 浅比较订阅：把 shallowEqual 作为 useSelector 的 equalityFn，让内联 selector
 * 返回新数组/对象时仅在浅比较不等才触发组件重渲染。
 *
 * 注意：必须把 shallowEqual 直接传给 useSelector（在 useSyncExternalStoreWithSelector
 * 内部比较，渲染前拦截），而不能在外面用 useRef 比较——后者时已晚，React 已经调度了一次渲染。
 * react-redux 8.1.3 未内置 useShallow，但 shallowEqual 是公开导出的，等价语义。
 */
export function useAppShallowSelector<T>(selector: (state: RootState) => T): T {
  return useSelector(selector, shallowEqual);
}

export { action, reducer, store, saga, useAppSelector, useAppDispatch };
