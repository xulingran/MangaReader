import { describe, expect, it, jest } from '@jest/globals';
import { Appearance, NativeModules } from 'react-native';
import { ThemeMode } from '~/utils';
import { resolveThemeMode } from '~/utils/theme/hooks';
import { getThemePalette } from '~/utils/theme/tokens';
import { syncNativeThemeMode, themeModeToColorScheme } from '~/utils/theme/native';

describe('主题解析与墨水屏色板', () => {
  it('显式亮色和深色覆盖系统主题', () => {
    expect(resolveThemeMode(ThemeMode.Light, 'dark')).toBe('light');
    expect(resolveThemeMode(ThemeMode.Dark, 'light')).toBe('dark');
  });

  it('跟随系统并在系统主题缺失时回退亮色', () => {
    expect(resolveThemeMode(ThemeMode.System, 'dark')).toBe('dark');
    expect(resolveThemeMode(ThemeMode.System, 'light')).toBe('light');
    expect(resolveThemeMode(ThemeMode.System, null)).toBe('light');
  });

  it('深色主表面只使用纯黑白', () => {
    const light = getThemePalette('light');
    const dark = getThemePalette('dark');
    expect(light.pressedBg).toBe('#ffffff');
    expect(dark.bg).toBe('#000000');
    expect(dark.card).toBe('#000000');
    expect(dark.text).toBe('#ffffff');
    expect(dark.border).toBe('#ffffff');
    expect(dark.pressedBg).toBe('#000000');
    expect(dark.selectedBg).toBe('#ffffff');
    expect(dark.selectedText).toBe('#000000');
  });

  it('system 传给 Appearance 时使用 null', () => {
    expect(themeModeToColorScheme(ThemeMode.Light)).toBe('light');
    expect(themeModeToColorScheme(ThemeMode.Dark)).toBe('dark');
    expect(themeModeToColorScheme(ThemeMode.System)).toBeNull();
  });

  it('先更新冷启动模式再让 Appearance 读取最终系统配置', async () => {
    const calls: string[] = [];
    const persistThemeMode = NativeModules.ThemeModeModule.persistThemeMode as ReturnType<
      typeof jest.fn
    >;
    const setColorScheme = Appearance.setColorScheme as ReturnType<typeof jest.fn>;
    persistThemeMode.mockImplementationOnce(async () => {
      calls.push('native');
    });
    setColorScheme.mockImplementationOnce(() => {
      calls.push('appearance');
    });

    await syncNativeThemeMode(ThemeMode.System);

    expect(calls).toEqual(['native', 'appearance']);
    expect(setColorScheme).toHaveBeenCalledWith(null);
  });
});
