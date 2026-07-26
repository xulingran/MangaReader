import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PluginSelect } from '~/views/Discovery';
import { mockPalette } from './helpers/mockNativeBase';

jest.mock('native-base', () =>
  require('./helpers/mockNativeBase').createNativeBaseMock({
    hostComponents: ['View', 'Text', 'Input', 'Button', 'HStack'],
    extra: {
      useDisclose: () => ({
        isOpen: false,
        onOpen: jest.fn(),
        onClose: jest.fn(),
      }),
    },
  })
);

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
  useThemePalette: () => mockPalette,
}));

describe('搜索栏来源选择器', () => {
  it('在白色标题栏上使用黑色文字', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<PluginSelect />);
    });

    // 来源选择按钮直接展示当前来源 label（fixture 中 bzm 的 label 为「漫画bz」），
    // 用展示文案定位而非 w/h/variant 等样式 props
    const button = tree!.root.find((node) => node.props.children === '漫画bz');
    // 文字颜色取自亮色 tokens.text（#000000），与生产保持同源
    expect(button.props._text).toMatchObject({ color: '#000000' });

    act(() => tree!.unmount());
  });
});
