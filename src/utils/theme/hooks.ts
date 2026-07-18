import { ThemeTokenKey, themeTokens } from '~/utils/theme/tokens';

/**
 * 电子墨水版：暗色模式已移除，始终返回 light 值
 * 保留双参数签名以兼容既有调用点
 */
export function useThemeColor<T = string>(lightValue: T, _darkValue?: T): T {
  return lightValue;
}

export function useTokenColor(key: ThemeTokenKey) {
  return themeTokens[key].light;
}

export const useBackgroundColor = () => useTokenColor('bg');
export const useTextColor = () => useTokenColor('text');
export const useSubTextColor = () => useTokenColor('subText');
export const useCardBgColor = () => useTokenColor('card');
export const useBorderColor = () => useTokenColor('border');
export const useHeaderBgColor = () => useTokenColor('header');

export const usePlaceholderTextColor = () => useTokenColor('placeholderTextColor');
