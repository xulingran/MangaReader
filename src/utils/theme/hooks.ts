import { createContext, useContext, useMemo, useState } from 'react';
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

/**
 * 主题偏好 Context。
 *
 * theme/hooks 属于 utils，不能直接读 Redux——redux slice/saga 反向依赖 ~/utils（枚举/工具），
 * 形成循环依赖会让 native-base 的 jest mock 在模块加载竞态下拿到未初始化的 extendTheme。
 *
 * 因此由 AppShell（已订阅 Redux 的 setting.themeMode）把权威值注入 Provider，全树子组件
 * 通过 useThemePalette/useResolvedThemeMode/useTokenColor 自动跟随，无需各自再读 Redux。
 * 未注入时回退跟随系统，与冷启动期 SharedPreferences 镜像的语义一致（AGENTS.md「冷启动主题」）。
 */
const ThemePreferenceContext = createContext<ThemeMode>(ThemeMode.System);

export const ThemePreferenceProvider = ThemePreferenceContext.Provider;

/** 测试/独立渲染场景下手动注入偏好；正常渲染走 AppShell 的 Provider。 */
export const useThemePreference = (): ThemeMode => useContext(ThemePreferenceContext);

export function useResolvedThemeMode(): ResolvedThemeMode {
  return resolveThemeMode(useContext(ThemePreferenceContext), useColorScheme());
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
