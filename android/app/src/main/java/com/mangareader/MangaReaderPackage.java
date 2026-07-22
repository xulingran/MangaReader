package com.mangareader;

import androidx.annotation.NonNull;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.mangareader.eink.EInkKeyModule;
import com.mangareader.image.ImageProcessorModule;
import com.mangareader.secure.SecureTokenModule;
import com.mangareader.theme.ThemeModeModule;

import java.util.HashMap;
import java.util.Map;

/** 按模块名延迟创建原生模块，兼容 RN 0.81 旧架构。 */
public class MangaReaderPackage extends BaseReactPackage {
  @Override
  public NativeModule getModule(
      @NonNull String name, @NonNull ReactApplicationContext reactContext) {
    switch (name) {
      case EInkKeyModule.NAME:
        return new EInkKeyModule(reactContext);
      case ImageProcessorModule.NAME:
        return new ImageProcessorModule(reactContext);
      case SecureTokenModule.NAME:
        return new SecureTokenModule(reactContext);
      case ThemeModeModule.NAME:
        return new ThemeModeModule(reactContext);
      default:
        return null;
    }
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      Map<String, ReactModuleInfo> modules = new HashMap<>();
      addModule(modules, EInkKeyModule.NAME, EInkKeyModule.class);
      addModule(modules, ImageProcessorModule.NAME, ImageProcessorModule.class);
      addModule(modules, SecureTokenModule.NAME, SecureTokenModule.class);
      addModule(modules, ThemeModeModule.NAME, ThemeModeModule.class);
      return modules;
    };
  }

  private static void addModule(
      Map<String, ReactModuleInfo> modules,
      String name,
      Class<? extends NativeModule> moduleClass) {
    modules.put(
        name,
        new ReactModuleInfo(
            name,
            moduleClass.getName(),
            false,
            false,
            false,
            false));
  }
}
