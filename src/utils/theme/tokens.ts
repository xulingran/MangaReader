/**
 * 电子墨水版语义色板：light/dark 取同一套灰阶值（暗色模式已移除）
 */
export const themeTokens = {
  // 背景
  bg: { light: 'white', dark: 'white' },
  // 主文本
  text: { light: 'black', dark: 'black' },
  // 次文本
  subText: { light: 'gray.600', dark: 'gray.600' },
  // 卡片背景
  card: { light: 'gray.100', dark: 'gray.100' },
  // 边框
  border: { light: 'black', dark: 'black' },
  // 顶部条
  header: { light: 'white', dark: 'white' },
  // 占位符
  placeholderTextColor: { light: 'gray.400', dark: 'gray.400' },
} as const;

export type ThemeTokenKey = keyof typeof themeTokens;
