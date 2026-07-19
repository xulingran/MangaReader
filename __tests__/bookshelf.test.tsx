import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import Bookshelf, { BOOKSHELF_ROW_HEIGHT } from '~/components/Bookshelf';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  const ViewComponent = (props: object) => mockReact.createElement(View, props);
  return {
    Box: ViewComponent,
    HStack: ViewComponent,
    VStack: ViewComponent,
    Pressable: ViewComponent,
    Icon: ViewComponent,
    Text,
  };
});

jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ({ data, extraData, renderItem }: any) =>
      mockReact.createElement(
        View,
        null,
        data.map((item: Manga, index: number) =>
          mockReact.createElement(
            mockReact.Fragment,
            { key: item.hash },
            renderItem({ item, index, extraData })
          )
        )
      ),
  };
});

jest.mock('~/hooks', () => ({
  useDelayRender: () => true,
  useDebouncedSafeAreaFrame: () => ({ width: 632, height: 840 }),
  useDebouncedSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock('~/utils/theme/hooks', () => ({
  useBackgroundColor: () => 'white',
}));

jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');

describe('漫画列表封面', () => {
  it('按原始比例完整显示，不裁切封面', () => {
    const item = {
      hash: 'test&comic',
      title: '测试漫画',
      sourceName: '测试源',
      cover: 'https://example.com/cover.jpg',
    } as Manga;
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<Bookshelf list={[item]} itemOnPress={jest.fn()} />);
    });

    const cover = tree!.root.findByProps({ source: item.cover });
    const coverFrame = tree!.root.find(
      (node) =>
        node.props.borderWidth === 1 &&
        node.props.borderColor === 'black' &&
        node.props.overflow === 'hidden'
    );

    expect(coverFrame.props.width).toBeUndefined();
    expect(coverFrame.props.height).toBeUndefined();
    expect(coverFrame.props.style).toMatchObject({ width: 64, height: 96 });
    expect(coverFrame.props.style.height + 16).toBe(BOOKSHELF_ROW_HEIGHT);
    expect(cover.props).toMatchObject({
      source: item.cover,
      resizeMode: 'contain',
      style: { width: '100%', height: '100%' },
    });

    act(() => tree!.unmount());
  });
});
