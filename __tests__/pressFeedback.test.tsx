import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Appearance } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ContinueReadingButton from '~/components/ContinueReadingButton';
import VectorIcon from '~/components/VectorIcon';
import { customTheme } from '~/utils/theme';
import { getThemePalette } from '~/utils/theme/tokens';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  return {
    extendTheme: (config: unknown) => config,
    Pressable: (props: object) => mockReact.createElement(View, props),
    IconButton: (props: object) => mockReact.createElement(View, props),
    Icon: (props: object) => mockReact.createElement(View, props),
    Text,
  };
});

jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
jest.mock('react-native-vector-icons/Octicons', () => 'Octicons');
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

const palette = getThemePalette(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

const chapters = [
  {
    hash: 'test&manga&chapter-1',
    mangaId: 'manga',
    chapterId: 'chapter-1',
    href: 'https://example.com/chapter-1',
    title: '第 1 话',
  },
] as ChapterItem[];

describe('墨水屏按压反色', () => {
  it('Button 各 variant 按压态为瞬时黑白反色', () => {
    const variants = (customTheme as any).components.Button.variants;
    expect(variants.eink._pressed).toMatchObject({
      bg: 'white',
      borderColor: 'black',
      _text: { color: 'black' },
      _icon: { color: 'black' },
    });
    expect(variants.eink._dark._pressed).toMatchObject({
      bg: 'black',
      borderColor: 'white',
      _text: { color: 'white' },
      _icon: { color: 'white' },
    });
    expect(variants.outline._pressed).toMatchObject({ bg: 'black', _text: { color: 'white' } });
    expect(variants.outline._dark._pressed).toMatchObject({
      bg: 'white',
      _text: { color: 'black' },
    });
    expect(variants.ghost._pressed).toMatchObject({ bg: 'black', _text: { color: 'white' } });
    expect(variants.ghost._dark._pressed).toMatchObject({ bg: 'white', _text: { color: 'black' } });
    expect(variants.link._pressed).toMatchObject({ bg: 'black', _text: { color: 'white' } });
    expect(variants.link._dark._pressed).toMatchObject({ bg: 'white', _text: { color: 'black' } });
  });

  it('反色按钮按压时回落正色，松开恢复', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ContinueReadingButton
          chapters={chapters}
          lastWatch={{ chapter: chapters[0].hash, page: 8, title: chapters[0].title }}
          onContinue={jest.fn()}
        />
      );
    });

    const button = () =>
      tree!.root.findByProps({ accessibilityLabel: '继续阅读：第 1 话，第 8 页' });
    const text = () => tree!.root.findByProps({ fontSize: 13 });

    expect(button().props.bg).toBe(palette.selectedBg);
    expect(text().props.color).toBe(palette.selectedText);
    act(() => button().props.onPressIn());
    expect(button().props.bg).toBe(palette.bg);
    expect(text().props.color).toBe(palette.text);
    act(() => button().props.onPressOut());
    expect(button().props.bg).toBe(palette.selectedBg);
    expect(text().props.color).toBe(palette.selectedText);
    act(() => tree!.unmount());
  });

  it('图标按钮按压时反色为实心圆，松开恢复', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<VectorIcon name="arrow-back" onPress={jest.fn()} />);
    });

    const button = () => tree!.root.findByProps({ accessibilityLabel: '返回' });

    expect(button().props.bg).toBe('transparent');
    expect(button().props.icon.props.color).toBe(palette.text);
    act(() => button().props.onPressIn());
    expect(button().props.bg).toBe(palette.selectedBg);
    expect(button().props.icon.props.color).toBe(palette.selectedText);
    act(() => button().props.onPressOut());
    expect(button().props.bg).toBe('transparent');
    expect(button().props.icon.props.color).toBe(palette.text);
    act(() => tree!.unmount());
  });
});
