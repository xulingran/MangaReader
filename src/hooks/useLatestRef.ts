import { useLatest } from './useLatest';

/**
 * 返回一个始终持有最新值的 ref（useLatest 的语义化别名）。
 *
 * 赋值放在 useEffect 中，避免 render 期写 ref（并发渲染下不安全）。
 * 与 useLatest 完全等价，仅为调用点可读性提供更直观的名字。
 */
export const useLatestRef = useLatest;
