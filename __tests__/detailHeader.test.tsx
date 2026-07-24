import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Sequence } from '~/utils';
import { action } from '~/redux/slice';
import { HeartAndBrowser } from '~/views/Detail';

const mockDispatch = jest.fn();
const mockNavigation = { setParams: jest.fn() };
const mockHeaderState = {
  setting: { sequence: Sequence.Asc },
  favorites: [],
  dict: { manga: {} },
} as unknown as RootState;

jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({ isReady: () => false }),
  useRoute: () => ({ params: { mangaHash: 'test&manga' } }),
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn(),
}));

jest.mock('~/redux', () => {
  const actual = jest.requireActual<typeof import('~/redux/slice')>('~/redux/slice');
  return {
    action: actual.action,
    useAppDispatch: () => mockDispatch,
    useAppSelector: <T,>(selector: (state: RootState) => T) => selector(mockHeaderState),
  };
});

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { View: MockView } = require('react-native');
  const MockComponent = (props: object) => mockReact.createElement(MockView, props);
  const MockButton = MockComponent as unknown as { Group: typeof MockComponent };
  MockButton.Group = MockComponent;
  return {
    extendTheme: (theme: object) => theme,
    HStack: MockComponent,
    View: MockComponent,
    Text: MockComponent,
    Button: MockButton,
    Toast: { show: jest.fn() },
    useDisclose: () => ({ isOpen: false, onOpen: jest.fn(), onClose: jest.fn() }),
  };
});

jest.mock('~/components/VectorIcon', () => ({
  __esModule: true,
  default: 'VectorIcon',
}));

describe('漫画详情页顶部操作', () => {
  it('在排序与浏览器按钮之间显示下载管理按钮，并派发打开请求', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HeartAndBrowser />);
    });

    const buttons = tree!.root.findAll(
      (node) => typeof node.props.accessibilityLabel === 'string'
    );
    expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual([
      '收藏漫画',
      '切换章节排序',
      '打开下载管理',
      '在浏览器中打开漫画',
    ]);

    act(() => {
      tree!.root.findByProps({ accessibilityLabel: '打开下载管理' }).props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith(action.setPrehandleLogStatus(true));

    act(() => tree!.unmount());
  });
});
