import { beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Image, Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CacheManager } from '@georstat/react-native-image-cache';
import StaticCachedImage from '~/components/StaticCachedImage';

const getCacheEntry = CacheManager.get as jest.Mock;

beforeEach(() => {
  getCacheEntry.mockClear();
});

it('使用静态原生 Image，并忽略内容相同的内联请求头对象', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <StaticCachedImage
        source="https://example.com/cover.jpg"
        headers={{ Referer: 'https://example.com' }}
      />
    );
    await Promise.resolve();
  });

  expect(getCacheEntry).toHaveBeenCalledTimes(1);
  expect(tree!.root.findByType(Image).props.source).toEqual({
    uri: Platform.OS === 'android' ? 'file:///cache/images_cache/test' : '/cache/images_cache/test',
  });

  await act(async () => {
    tree!.update(
      <StaticCachedImage
        source="https://example.com/cover.jpg"
        headers={{ Referer: 'https://example.com' }}
      />
    );
    await Promise.resolve();
  });

  expect(getCacheEntry).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});
