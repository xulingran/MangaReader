/**
 * 图标说明文字（setting.iconLabel）测试：
 * - 关闭时 VectorIcon 不渲染说明文字（渲染路径与功能上线前一致）
 * - 开启时显示 label，未传 label 回退 accessibilityLabel，label 优先于 accessibilityLabel
 */
import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Text as RNText } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { IconLabel } from '~/utils/enum';
import VectorIcon from '~/components/VectorIcon';

const mockState = { setting: { iconLabel: IconLabel.Disabled } } as unknown as RootState;

jest.mock('~/redux', () => ({
  useAppSelector: <T,>(selector: (state: RootState) => T) => selector(mockState),
}));

jest.mock('native-base', () =>
  require('./helpers/mockNativeBase').createNativeBaseMock({
    viewComponents: ['IconButton', 'Icon', 'VStack'],
    text: 'react-native',
  })
);

jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
jest.mock('react-native-vector-icons/Octicons', () => 'Octicons');
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

const renderIcon = (props: React.ComponentProps<typeof VectorIcon>) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<VectorIcon {...props} />);
  });
  return tree!;
};

const labelTexts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(RNText).map((node) => node.props.children);

describe('图标说明文字', () => {
  it('iconLabel=Disabled 时不渲染说明文字', () => {
    mockState.setting.iconLabel = IconLabel.Disabled;
    const tree = renderIcon({ name: 'search', label: '搜索', onPress: jest.fn() });

    expect(labelTexts(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('iconLabel=Enable 时显示 label 文案', () => {
    mockState.setting.iconLabel = IconLabel.Enable;
    const tree = renderIcon({ name: 'search', label: '搜索', onPress: jest.fn() });

    expect(labelTexts(tree)).toContain('搜索');
    act(() => tree.unmount());
  });

  it('未传 label 时回退为 accessibilityLabel', () => {
    mockState.setting.iconLabel = IconLabel.Enable;
    const tree = renderIcon({
      name: 'sort-asc',
      source: 'octicons',
      accessibilityLabel: '切换章节排序',
      onPress: jest.fn(),
    });

    expect(labelTexts(tree)).toContain('切换章节排序');
    act(() => tree.unmount());
  });

  it('label 优先于 accessibilityLabel', () => {
    mockState.setting.iconLabel = IconLabel.Enable;
    const tree = renderIcon({
      name: 'sort-asc',
      source: 'octicons',
      label: '排序',
      accessibilityLabel: '切换章节排序',
      onPress: jest.fn(),
    });

    expect(labelTexts(tree)).toContain('排序');
    expect(labelTexts(tree)).not.toContain('切换章节排序');
    act(() => tree.unmount());
  });
});
