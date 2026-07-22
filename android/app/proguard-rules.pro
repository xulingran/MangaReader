# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details on, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ==========================================================
# 项目自定义 keep 规则（仅补充第三方库 consumer rules 未覆盖的部分）。
# React Native / Hermes / Reanimated / Gesture Handler / MMKV / OkHttp 等都自带
# consumer-proguard-rules，发布时会被 R8 自动合并，不必在此重复声明。
# 这里只 keep 本项目自定义的 E-Ink 原生模块。
# ==========================================================

# EInkKeyModule 通过 ReactMethod 暴露给 JS；RN 自带 consumer rules 已覆盖
# NativeModule/ReactMethod，这里仅限定保留项目自定义模块包，避免保留整个应用包。
-keep class com.mangareader.eink.** { *; }

# 冷启动主题桥由 BaseReactPackage 按模块名创建，并在 Application 启动时静态调用。
-keep class com.mangareader.theme.** { *; }
