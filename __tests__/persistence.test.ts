import { describe, expect, it } from '@jest/globals';
import { Plugin } from '~/plugins';
import { buildChapterIndex, buildMangaIndex, buildProgressPairs } from '~/redux/persistence';

const favoriteMangaHash = `${Plugin.MBZ}&favorite`;
const favoriteChapterHash = `${favoriteMangaHash}&chapter-1`;
const transientMangaHash = `${Plugin.MBZ}&transient`;
const transientChapterHash = `${transientMangaHash}&chapter-1`;

const state = {
  favorites: [{ mangaHash: favoriteMangaHash, isTrend: false, enableBatch: true }],
  dict: {
    manga: {
      [favoriteMangaHash]: {
        title: '收藏漫画',
        chapters: [{ hash: favoriteChapterHash }],
      },
      [transientMangaHash]: {
        title: '临时搜索结果',
        chapters: [{ hash: transientChapterHash }],
      },
    },
    chapter: {
      [favoriteChapterHash]: { hash: favoriteChapterHash, images: [{ uri: '1.jpg' }] },
      [transientChapterHash]: { hash: transientChapterHash, images: [{ uri: '2.jpg' }] },
    },
    record: {
      [favoriteChapterHash]: {
        total: 1,
        progress: 100,
        imagesLoaded: [1],
        isVisited: true,
      },
    },
    lastWatch: {
      [favoriteMangaHash]: { chapter: favoriteChapterHash, page: 1 },
    },
  },
} as unknown as RootState;

describe('增量持久化', () => {
  it('索引只包含收藏漫画及其已加载章节', () => {
    expect(buildMangaIndex(state)).toEqual([favoriteMangaHash]);
    expect(buildChapterIndex(state)).toEqual([favoriteChapterHash]);
  });

  it('翻页仅序列化发生变化的收藏条目', () => {
    const pairs = buildProgressPairs(
      state,
      [favoriteMangaHash, transientMangaHash],
      [favoriteChapterHash, transientChapterHash]
    );

    expect(pairs.map(([key]) => key)).toEqual([favoriteMangaHash, favoriteChapterHash]);
    expect(JSON.parse(pairs[0][1])).toEqual({
      manga: state.dict.manga[favoriteMangaHash],
      lastWatch: state.dict.lastWatch[favoriteMangaHash],
    });
    expect(JSON.parse(pairs[1][1])).toEqual({
      chapter: state.dict.chapter[favoriteChapterHash],
      record: state.dict.record[favoriteChapterHash],
    });
  });
});
