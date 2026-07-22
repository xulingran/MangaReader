/**
 * 墨水屏语义色板。
 * 深色界面只在次要信息中使用灰阶，主要表面和交互状态保持纯黑白反转。
 */
export const themeTokens = {
  bg: { light: '#ffffff', dark: '#000000' },
  text: { light: '#000000', dark: '#ffffff' },
  subText: { light: '#5c5c5c', dark: '#c2c2c2' },
  card: { light: '#f0f0f0', dark: '#000000' },
  border: { light: '#000000', dark: '#ffffff' },
  header: { light: '#ffffff', dark: '#000000' },
  placeholderTextColor: { light: '#7a7a7a', dark: '#a3a3a3' },
  disabled: { light: '#a3a3a3', dark: '#5c5c5c' },
  selectedBg: { light: '#000000', dark: '#ffffff' },
  selectedText: { light: '#ffffff', dark: '#000000' },
  pressedBg: { light: '#ffffff', dark: '#000000' },
  imagePlaceholder: { light: '#f0f0f0', dark: '#0a0a0a' },
} as const;

export type ThemeTokenKey = keyof typeof themeTokens;
export type ResolvedThemeMode = 'light' | 'dark';

export const themePalettes = {
  light: {
    bg: themeTokens.bg.light,
    text: themeTokens.text.light,
    subText: themeTokens.subText.light,
    card: themeTokens.card.light,
    border: themeTokens.border.light,
    header: themeTokens.header.light,
    placeholderTextColor: themeTokens.placeholderTextColor.light,
    disabled: themeTokens.disabled.light,
    selectedBg: themeTokens.selectedBg.light,
    selectedText: themeTokens.selectedText.light,
    pressedBg: themeTokens.pressedBg.light,
    imagePlaceholder: themeTokens.imagePlaceholder.light,
  },
  dark: {
    bg: themeTokens.bg.dark,
    text: themeTokens.text.dark,
    subText: themeTokens.subText.dark,
    card: themeTokens.card.dark,
    border: themeTokens.border.dark,
    header: themeTokens.header.dark,
    placeholderTextColor: themeTokens.placeholderTextColor.dark,
    disabled: themeTokens.disabled.dark,
    selectedBg: themeTokens.selectedBg.dark,
    selectedText: themeTokens.selectedText.dark,
    pressedBg: themeTokens.pressedBg.dark,
    imagePlaceholder: themeTokens.imagePlaceholder.dark,
  },
} as const;

export const getThemePalette = (mode: ResolvedThemeMode) => themePalettes[mode];

export type ThemePalette = ReturnType<typeof getThemePalette>;
