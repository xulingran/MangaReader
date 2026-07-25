import { useMemo, useState } from 'react';
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
  return resolveThemeMode(ThemeMode.System, useColorScheme());
}

export function useTokenColor(key: ThemeTokenKey) {
  const mode = useResolvedThemeMode();
  return themeTokens[key][mode];
}

export function useThemePalette() {
  return getThemePalette(useResolvedThemeMode());
}

export const useTextColor = () => useTokenColor('text');
export const useSubTextColor = () => useTokenColor('subText');

/**
 * 按压反色反馈的状态驱动（瞬时切换，无动画）。
 * 约定：正色元素 pressed 时翻转 selectedBg/selectedText 对；
 * 反色元素（黑底按钮、已选中项）pressed 时回落 bg/text 对；边框保持 border。
 */
export function usePressedState() {
  const [pressed, setPressed] = useState(false);
  const bind = useMemo(
    () => ({
      onPressIn: () => setPressed(true),
      onPressOut: () => setPressed(false),
    }),
    []
  );
  return [pressed, bind] as const;
}
