package com.mangareader.theme;

import static org.junit.Assert.assertEquals;

import android.app.UiModeManager;

import androidx.appcompat.app.AppCompatDelegate;

import org.junit.Test;

public class ThemeModeModuleTest {
  @Test
  public void mapsSupportedModesToAppCompat() {
    assertEquals(
        AppCompatDelegate.MODE_NIGHT_NO,
        ThemeModeModule.nightModeFor(ThemeModeModule.MODE_LIGHT));
    assertEquals(
        AppCompatDelegate.MODE_NIGHT_YES,
        ThemeModeModule.nightModeFor(ThemeModeModule.MODE_DARK));
    assertEquals(
        AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM,
        ThemeModeModule.nightModeFor(ThemeModeModule.MODE_SYSTEM));
  }

  @Test
  public void mapsSupportedModesToPersistedApplicationNightMode() {
    assertEquals(
        UiModeManager.MODE_NIGHT_NO,
        ThemeModeModule.applicationNightModeFor(ThemeModeModule.MODE_LIGHT));
    assertEquals(
        UiModeManager.MODE_NIGHT_YES,
        ThemeModeModule.applicationNightModeFor(ThemeModeModule.MODE_DARK));
    assertEquals(
        UiModeManager.MODE_NIGHT_AUTO,
        ThemeModeModule.applicationNightModeFor(ThemeModeModule.MODE_SYSTEM));
    assertEquals(
        UiModeManager.MODE_NIGHT_AUTO,
        ThemeModeModule.applicationNightModeFor("sepia"));
  }

  @Test
  public void invalidOrMissingModeFallsBackToSystem() {
    assertEquals(ThemeModeModule.MODE_SYSTEM, ThemeModeModule.normalizeMode(null));
    assertEquals(ThemeModeModule.MODE_SYSTEM, ThemeModeModule.normalizeMode("sepia"));
    assertEquals(
        AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM,
        ThemeModeModule.nightModeFor("sepia"));
  }
}
