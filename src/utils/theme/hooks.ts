import { useColorScheme } from 'react-native';
import { ThemeMode } from '~/utils/enum';
import {
  getThemePalette,
  ResolvedThemeMode,
  ThemeTokenKey,
  themeTokens,
} from '~/utils/theme/tokens';

export function resolveThemeMode(
  preference: ThemeMode,
  systemMode: ReturnType<typeof useColorScheme>
): ResolvedThemeMode {
  if (preference === ThemeMode.Light || preference === ThemeMode.Dark) {
    return preference;
  }
  return systemMode === ThemeMode.Dark ? ThemeMode.Dark : ThemeMode.Light;
}

export function useResolvedThemeMode(): ResolvedThemeMode {
  return useColorScheme() === ThemeMode.Dark ? ThemeMode.Dark : ThemeMode.Light;
}

export function useThemeColor<T>(lightValue: T, darkValue: T): T {
  return useResolvedThemeMode() === ThemeMode.Dark ? darkValue : lightValue;
}

export function useTokenColor(key: ThemeTokenKey) {
  const mode = useResolvedThemeMode();
  return themeTokens[key][mode];
}

export function useThemePalette() {
  return getThemePalette(useResolvedThemeMode());
}

export const useBackgroundColor = () => useTokenColor('bg');
export const useTextColor = () => useTokenColor('text');
export const useSubTextColor = () => useTokenColor('subText');
export const useCardBgColor = () => useTokenColor('card');
export const useBorderColor = () => useTokenColor('border');
export const useHeaderBgColor = () => useTokenColor('header');
export const useDisabledColor = () => useTokenColor('disabled');
export const useSelectedBgColor = () => useTokenColor('selectedBg');
export const useSelectedTextColor = () => useTokenColor('selectedText');
export const usePressedBgColor = () => useTokenColor('pressedBg');
export const useImagePlaceholderColor = () => useTokenColor('imagePlaceholder');
export const usePlaceholderTextColor = () => useTokenColor('placeholderTextColor');
