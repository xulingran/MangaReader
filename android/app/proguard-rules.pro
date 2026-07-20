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
# 这里只 keep：本项目自定义的 E-Ink 原生模块 + React Native Bridge 反射入口。
# ==========================================================

# 项目自定义原生模块（EInkKeyModule 等通过 ReactMethod 暴露给 JS，
# 走反射注册，不能被 R8 重命名或内联裁剪）
-keep class com.mangareader.** { *; }
-keepclassmembers class com.mangareader.** {
    @com.facebook.react.bridge.* <methods>;
}

# ReactMethod / ReactModule 注解的方法（兜底，理论上 RN consumer rules 已覆盖）
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
    @com.facebook.react.module.annotations.ReactModule <methods>;
}
