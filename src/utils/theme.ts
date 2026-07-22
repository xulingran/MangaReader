import { extendTheme } from 'native-base';

/** 电子墨水主题：只保留黑白与有限灰阶，并由 Android uiMode 驱动 NativeBase。 */
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
    useSystemColorMode: true,
  },
  components: {
    Text: {
      baseStyle: {
        color: 'black',
        _dark: { color: 'white' },
      },
    },
    Button: {
      defaultProps: {
        variant: 'eink',
        colorScheme: 'gray',
      },
      variants: {
        eink: {
          bg: 'black',
          borderWidth: 1,
          borderColor: 'black',
          _text: { color: 'white', fontWeight: 'bold' },
          _icon: { color: 'white' },
          _pressed: { bg: 'black' },
          _disabled: {
            opacity: 1,
            bg: 'gray.400',
            borderColor: 'gray.400',
            _text: { color: 'black' },
            _icon: { color: 'black' },
          },
          _dark: {
            bg: 'white',
            borderColor: 'white',
            _text: { color: 'black' },
            _icon: { color: 'black' },
            _pressed: { bg: 'white' },
            _disabled: {
              opacity: 1,
              bg: 'gray.600',
              borderColor: 'gray.600',
              _text: { color: 'white' },
              _icon: { color: 'white' },
            },
          },
        },
        outline: {
          bg: 'white',
          borderWidth: 1,
          borderColor: 'black',
          _text: { color: 'black', fontWeight: 'bold' },
          _icon: { color: 'black' },
          _pressed: { bg: 'white' },
          _disabled: {
            opacity: 1,
            borderColor: 'gray.400',
            _text: { color: 'gray.400' },
            _icon: { color: 'gray.400' },
          },
          _dark: {
            bg: 'black',
            borderColor: 'white',
            _text: { color: 'white' },
            _icon: { color: 'white' },
            _pressed: { bg: 'black' },
            _disabled: {
              opacity: 1,
              borderColor: 'gray.600',
              _text: { color: 'gray.600' },
              _icon: { color: 'gray.600' },
            },
          },
        },
        ghost: {
          bg: 'transparent',
          _text: { color: 'black', fontWeight: 'bold' },
          _icon: { color: 'black' },
          _pressed: { bg: 'transparent' },
          _disabled: {
            opacity: 1,
            _text: { color: 'gray.400' },
            _icon: { color: 'gray.400' },
          },
          _dark: {
            _text: { color: 'white' },
            _icon: { color: 'white' },
            _pressed: { bg: 'transparent' },
            _disabled: {
              opacity: 1,
              _text: { color: 'gray.600' },
              _icon: { color: 'gray.600' },
            },
          },
        },
        link: {
          bg: 'transparent',
          _text: { color: 'black', fontWeight: 'bold' },
          _icon: { color: 'black' },
          _pressed: { bg: 'transparent' },
          _disabled: {
            opacity: 1,
            _text: { color: 'gray.400' },
            _icon: { color: 'gray.400' },
          },
          _dark: {
            _text: { color: 'white' },
            _icon: { color: 'white' },
            _pressed: { bg: 'transparent' },
            _disabled: {
              opacity: 1,
              _text: { color: 'gray.600' },
              _icon: { color: 'gray.600' },
            },
          },
        },
      },
    },
    IconButton: {
      baseStyle: {
        _pressed: { bg: 'transparent' },
        _disabled: { opacity: 1 },
      },
    },
  },
});
