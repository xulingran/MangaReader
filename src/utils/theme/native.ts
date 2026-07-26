import { Appearance, NativeModules } from 'react-native';
import { ThemeMode } from '~/utils/enum';

interface ThemeModeNativeModule {
  persistThemeMode(mode: ThemeMode): Promise<void>;
}

export const themeModeToColorScheme = (mode: ThemeMode): 'light' | 'dark' | null =>
  mode === ThemeMode.System ? null : mode;

export async function syncNativeThemeMode(mode: ThemeMode): Promise<void> {
  const colorScheme = themeModeToColorScheme(mode);
  const themeModeModule = (NativeModules as Record<string, unknown>).ThemeModeModule as
    | ThemeModeNativeModule
    | undefined;
  if (!themeModeModule) {
    // 桥缺失时 Appearance 回退已经生效，属于成功降级而非失败：
    // 不抛错，避免调用方把已完成的降级当成同步失败处理。
    Appearance.setColorScheme(colorScheme);
    console.warn('缺少 Android 主题桥，已回退到 Appearance 设置主题');
    return;
  }
  try {
    // 先清理或写入 Android 12+ 的应用级覆盖，再让 Appearance 读取最终 Configuration。
    await themeModeModule.persistThemeMode(mode);
  } finally {
    // 即使冷启动镜像写入失败，本次界面仍尽量保持用户选择。
    Appearance.setColorScheme(colorScheme);
  }
}
