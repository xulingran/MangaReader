import { extendTheme } from 'native-base';

/**
 * 电子墨水版主题：纯白背景、黑色文字与边框、有限灰阶
 * 已移除紫色主题、暗色模式与阴影
 */
export const customTheme = extendTheme({
  colors: {
    gray: {
      50: '#fafafa',
      100: '#f0f0f0',
      200: '#e0e0e0',
      300: '#c2c2c2',
      400: '#a3a3a3',
      500: '#7a7a7a',
      600: '#5c5c5c',
      700: '#3d3d3d',
      800: '#1f1f1f',
      900: '#0a0a0a',
    },
    transparent: 'transparent',
  },
  config: {
    initialColorMode: 'light',
  },
});
