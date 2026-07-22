import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ContinueReadingButton, {
  getContinueReadingTarget,
} from '~/components/ContinueReadingButton';

jest.mock('native-base', () => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  return {
    Pressable: (props: object) => mockReact.createElement(View, props),
    Text,
  };
});

const chapters = [
  {
    hash: 'test&manga&chapter-1',
    mangaId: 'manga',
    chapterId: 'chapter-1',
    href: 'https://example.com/chapter-1',
    title: '第 1 话',
  },
] as ChapterItem[];

describe('详情页继续阅读', () => {
  it('没有记录或记录章节已不存在时不提供恢复入口', () => {
    expect(getContinueReadingTarget(chapters)).toBeUndefined();
    expect(
      getContinueReadingTarget(chapters, {
        chapter: 'test&manga&removed',
        page: 8,
        title: '已下架章节',
      })
    ).toBeUndefined();
  });

  it('点击按钮会提交上次章节和页码', () => {
    const onContinue = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ContinueReadingButton
          chapters={chapters}
          lastWatch={{ chapter: chapters[0].hash, page: 8, title: chapters[0].title }}
          onContinue={onContinue}
        />
      );
    });

    const button = tree!.root.findByProps({
      accessibilityLabel: '继续阅读：第 1 话，第 8 页',
    });
    act(() => button.props.onPress());

    expect(onContinue).toHaveBeenCalledWith({
      chapterHash: chapters[0].hash,
      page: 8,
      title: chapters[0].title,
    });
    act(() => tree!.unmount());
  });

  it('旧记录缺少有效页码时从第一页恢复', () => {
    expect(
      getContinueReadingTarget(chapters, {
        chapter: chapters[0].hash,
        page: 0,
        title: chapters[0].title,
      })
    ).toMatchObject({ chapterHash: chapters[0].hash, page: 1 });
  });
});
