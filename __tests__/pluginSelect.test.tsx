import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PluginSelect } from '~/views/Discovery';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const Component = (props: object) => mockReact.createElement('NativeBaseComponent', props);
  return {
    View: Component,
    Text: Component,
    Input: Component,
    Button: Component,
    HStack: Component,
    useDisclose: () => ({
      isOpen: false,
      onOpen: jest.fn(),
      onClose: jest.fn(),
    }),
  };
});

jest.mock('~/redux', () => ({
  action: {
    loadDiscovery: jest.fn(),
    setSource: jest.fn(),
    setDiscoveryFilter: jest.fn(),
    resetSearchFilter: jest.fn(),
  },
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: object) => unknown) =>
    selector({
      plugin: {
        source: 'bzm',
        list: [{ name: '漫画bz', label: '漫画bz', value: 'bzm', disabled: false }],
      },
    }),
}));

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ name: 'Discovery' }),
  useFocusEffect: jest.fn(),
}));

jest.mock('~/components/ActionsheetSelect', () => 'ActionsheetSelect');
jest.mock('~/components/VectorIcon', () => 'VectorIcon');
jest.mock('~/components/Bookshelf', () => 'Bookshelf');
jest.mock('~/utils', () => ({
  AsyncStatus: { Default: 'Default', Pending: 'Pending' },
  nonNullable: (value: unknown) => value != null,
}));
jest.mock('~/utils/navigation', () => ({
  navigate: jest.fn(),
  setParams: jest.fn(),
}));
jest.mock('~/utils/theme/hooks', () => ({
  useBackgroundColor: () => 'white',
  useThemePalette: () => ({
    bg: 'white',
    text: 'black',
    subText: 'gray.500',
    card: 'gray.100',
    border: 'black',
    header: 'white',
    placeholderTextColor: 'gray.500',
    disabled: 'gray.400',
    selectedBg: 'black',
    selectedText: 'white',
    pressedBg: 'gray.200',
    imagePlaceholder: 'gray.100',
  }),
}));

describe('搜索栏来源选择器', () => {
  it('在白色标题栏上使用黑色文字', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<PluginSelect />);
    });

    const button = tree!.root.find(
      (node) => node.props.w === 12 && node.props.h === 12 && node.props.variant === 'ghost'
    );
    expect(button.props._text).toMatchObject({ color: 'black' });

    act(() => tree!.unmount());
  });
});
