import { Appearance, NativeModules } from 'react-native';
import { ThemeMode } from '~/utils/enum';

interface ThemeModeNativeModule {
  persistThemeMode(mode: ThemeMode): Promise<void>;
}

export const themeModeToColorScheme = (mode: ThemeMode): 'light' | 'dark' | null =>
  mode === ThemeMode.System ? null : mode;

export async function syncNativeThemeMode(mode: ThemeMode): Promise<void> {
  const colorScheme = themeModeToColorScheme(mode);
  const module = NativeModules.ThemeModeModule as ThemeModeNativeModule | undefined;
  if (!module) {
    Appearance.setColorScheme(colorScheme);
    throw new Error('缺少 Android 主题桥');
  }
  try {
    // 先清理或写入 Android 12+ 的应用级覆盖，再让 Appearance 读取最终 Configuration。
    await module.persistThemeMode(mode);
  } finally {
    // 即使冷启动镜像写入失败，本次界面仍尽量保持用户选择。
    Appearance.setColorScheme(colorScheme);
  }
}
