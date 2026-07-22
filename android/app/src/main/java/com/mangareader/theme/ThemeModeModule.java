package com.mangareader.theme;

import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatDelegate;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * 主题偏好的冷启动镜像。
 * Redux 仍是正式数据源；这里仅让 Android 在 React 启动前选中正确的 DayNight 资源。
 */
public class ThemeModeModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ThemeModeModule";
  public static final String MODE_LIGHT = "light";
  public static final String MODE_DARK = "dark";
  public static final String MODE_SYSTEM = "system";

  private static final String PREFERENCES = "mangareader_theme";
  private static final String KEY_THEME_MODE = "theme_mode";

  public ThemeModeModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  public static String normalizeMode(String mode) {
    if (MODE_LIGHT.equals(mode) || MODE_DARK.equals(mode) || MODE_SYSTEM.equals(mode)) {
      return mode;
    }
    return MODE_SYSTEM;
  }

  public static int nightModeFor(String mode) {
    switch (normalizeMode(mode)) {
      case MODE_LIGHT:
        return AppCompatDelegate.MODE_NIGHT_NO;
      case MODE_DARK:
        return AppCompatDelegate.MODE_NIGHT_YES;
      default:
        return AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
    }
  }

  public static int applicationNightModeFor(String mode) {
    switch (normalizeMode(mode)) {
      case MODE_LIGHT:
        return UiModeManager.MODE_NIGHT_NO;
      case MODE_DARK:
        return UiModeManager.MODE_NIGHT_YES;
      default:
        // 应用级 AUTO 会清除 -night 覆盖，继续采用系统 Configuration。
        return UiModeManager.MODE_NIGHT_AUTO;
    }
  }

  private static SharedPreferences preferences(Context context) {
    return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
  }

  private static void applyMode(Context context, String mode) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      UiModeManager uiModeManager = context.getSystemService(UiModeManager.class);
      if (uiModeManager != null) {
        // API 31+ 由系统持久化应用主题，才能在创建系统 SplashScreen 前选中 night 资源。
        uiModeManager.setApplicationNightMode(applicationNightModeFor(mode));
      }
      return;
    }
    AppCompatDelegate.setDefaultNightMode(nightModeFor(mode));
  }

  /** 在首个 Activity 和 BootSplash 创建前调用。 */
  public static void applySavedThemeMode(Context context) {
    String mode = preferences(context).getString(KEY_THEME_MODE, MODE_SYSTEM);
    applyMode(context, mode);
  }

  /** 保存冷启动镜像；当前会话的 uiMode 由 JS Appearance.setColorScheme 驱动。 */
  @ReactMethod
  public void persistThemeMode(String mode, Promise promise) {
    String normalized = normalizeMode(mode);
    boolean committed =
        preferences(getReactApplicationContext())
            .edit()
            .putString(KEY_THEME_MODE, normalized)
            .commit();
    if (committed) {
      applyMode(getReactApplicationContext(), normalized);
      promise.resolve(null);
    } else {
      promise.reject("THEME_MODE_WRITE_FAILED", "保存冷启动主题失败");
    }
  }
}
