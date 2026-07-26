import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Appearance } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ContinueReadingButton from '~/components/ContinueReadingButton';
import VectorIcon from '~/components/VectorIcon';
import { customTheme } from '~/utils/theme';
import { getThemePalette } from '~/utils/theme/tokens';

jest.mock('native-base', () =>
  require('./helpers/mockNativeBase').createNativeBaseMock({
    viewComponents: ['Pressable', 'IconButton', 'Icon'],
    text: 'react-native',
    extra: {
      extendTheme: (config: unknown) => config,
    },
  })
);

jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
jest.mock('react-native-vector-icons/Octicons', () => 'Octicons');
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

// VectorIcon 经 useAppSelector 订阅 setting.iconLabel；此处固定为关闭，走纯图标渲染路径
const mockIconLabelState = { setting: { iconLabel: 1 } } as unknown as RootState;
jest.mock('~/redux', () => ({
  useAppSelector: <T,>(selector: (state: RootState) => T) => selector(mockIconLabelState),
}));

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

const OPPOSITE: Record<string, string> = { black: 'white', white: 'black' };

interface PressableVariant {
  bg?: string;
  borderColor?: string;
  _text?: { color?: string };
  _icon?: { color?: string };
  _pressed?: {
    bg?: string;
    borderColor?: string;
    _text?: { color?: string };
    _icon?: { color?: string };
  };
  _dark?: PressableVariant;
}

/**
 * 按压反馈关键不变量（不钉死具体色值）：
 * - 按压底色 = 常态文字色，按压文字/图标色 = 常态文字/图标色的黑白互反
 * - 有边框的 variant 按压时边框色保持不变
 */
const expectPressedInverts = (normal: PressableVariant, pressed: PressableVariant['_pressed']) => {
  const normalText = normal._text?.color || '';
  expect(Object.keys(OPPOSITE)).toContain(normalText);
  expect(pressed?.bg).toBe(normalText);
  expect(pressed?._text?.color).toBe(OPPOSITE[normalText]);
  if (normal._icon?.color) {
    expect(pressed?._icon?.color).toBe(OPPOSITE[normal._icon.color]);
  }
  if (normal.borderColor && pressed?.borderColor) {
    expect(pressed.borderColor).toBe(normal.borderColor);
  }
};

describe('墨水屏按压反色', () => {
  it('Button 各 variant 按压态为常态的瞬时黑白反色', () => {
    const variants = (customTheme as any).components.Button.variants as Record<
      string,
      PressableVariant
    >;

    ['eink', 'outline', 'ghost', 'link'].forEach((name) => {
      const variant = variants[name];
      expect(variant?._pressed).toBeDefined();
      expect(variant?._dark?._pressed).toBeDefined();

      // 亮色：常态 → 按压互反
      expectPressedInverts(variant, variant._pressed);
      // 深色：_dark 覆盖后的常态 → _dark._pressed 互反
      expectPressedInverts({ ...variant, ...variant._dark }, variant._dark?._pressed);
    });
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

  it('memo 生效：父组件无关重渲染时不重建 IconButton', () => {
    // 包一层父组件，强制其重渲染；VectorIcon 的 props 内容不变时应被 memo 拦截
    const onPress = jest.fn();
    const Parent = ({ _tick }: { _tick: number }) => (
      <VectorIcon name="arrow-back" onPress={onPress} />
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Parent _tick={0} />);
    });
    const buttonBefore = tree!.root.findByProps({ accessibilityLabel: '返回' });
    const iconElementBefore = buttonBefore.props.icon;

    act(() => {
      tree!.update(<Parent _tick={1} />);
    });

    const buttonAfter = tree!.root.findByProps({ accessibilityLabel: '返回' });
    // memo 拦截：TestInstance 引用稳定（同一个 fiber，未重渲染）
    expect(buttonAfter).toBe(buttonBefore);
    // icon 元素也因 useMemo 保持引用稳定
    expect(buttonAfter.props.icon).toBe(iconElementBefore);

    act(() => tree!.unmount());
  });

  it('memo 自定义比较：调用方内联 accessibilityState 对象不穿透', () => {
    // 模拟业务代码里常见的内联对象写法：每次渲染都是新对象引用
    const onPress = jest.fn();
    const Wrapper = ({ checked }: { checked: boolean }) => (
      <VectorIcon name="check" onPress={onPress} accessibilityState={{ checked }} />
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Wrapper checked={false} />);
    });
    const buttonBefore = tree!.root.findByProps({ accessibilityLabel: '确认' });

    // 同样的 checked=false，但传入全新的内联对象引用 —— 旧实现会重渲染
    act(() => {
      tree!.update(<Wrapper checked={false} />);
    });

    const buttonAfter = tree!.root.findByProps({ accessibilityLabel: '确认' });
    expect(buttonAfter).toBe(buttonBefore);

    act(() => tree!.unmount());
  });
});
