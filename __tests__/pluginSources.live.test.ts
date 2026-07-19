import { expect, test } from '@jest/globals';
import { fetchData } from '~/utils';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';
import RM5 from '~/plugins/rm5';

const liveTest = process.env.RUN_LIVE_SOURCE_TESTS === '1' ? test : test.skip;

liveTest('HComic 实时列表可请求并解析', async () => {
  const response = await fetchData(HComic.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = HComic.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);
  const selected = result.discovery[0];
  const mangaId = selected.mangaId;
  expect(mangaId).toBeTruthy();

  const detailResponse = await fetchData(HComic.prepareMangaInfoFetch(mangaId, selected));
  expect(detailResponse.error).toBeUndefined();
  const detail = HComic.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
  expect(detail.manga.mangaId).toBe(mangaId);
  expect(detail.manga.title).toBe(selected.title);
  expect(detail.manga.chapters?.length).toBe(1);
  const chapter = HComic.handleChapter(detailResponse.data, mangaId, '1', 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images.length).toBeGreaterThan(0);
});

liveTest('MoeImg 实时列表可请求并解析', async () => {
  const response = await fetchData(MoeImg.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = MoeImg.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);
  expect(result.discovery[0].bookCover).toMatch(/^https:\/\//);

  const mangaId = result.discovery[0].mangaId;
  const detailResponse = await fetchData(MoeImg.prepareMangaInfoFetch(mangaId));
  expect(detailResponse.error).toBeUndefined();
  const detail = MoeImg.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
  const chapterId = detail.manga.chapters?.[0].chapterId || mangaId;
  const chapterResponse = await fetchData(MoeImg.prepareChapterFetch(mangaId, chapterId, 1, {}));
  expect(chapterResponse.error).toBeUndefined();
  const chapter = MoeImg.handleChapter(chapterResponse.data, mangaId, chapterId, 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images.length).toBeGreaterThan(0);
  const imageResponse = await fetch(chapter.chapter.images[0].uri, {
    headers: chapter.chapter.headers,
  });
  expect(imageResponse.ok).toBe(true);
  expect(imageResponse.headers.get('content-type')).toMatch(/^image\//);
});

liveTest('NHentai 实时列表可请求并解析', async () => {
  const response = await fetchData(NH.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = NH.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);
  const coverUri = result.discovery[0].bookCover;
  expect(coverUri).toContain('h-comic.link/api/nh/');
  const coverResponse = await fetch(coverUri || '', {
    headers: result.discovery[0].headers,
  });
  expect(coverResponse.ok).toBe(true);
  expect(coverResponse.headers.get('content-type')).toMatch(/^image\//);

  const mangaId = result.discovery[0].mangaId;
  const detailResponse = await fetchData(NH.prepareMangaInfoFetch(mangaId));
  expect(detailResponse.error).toBeUndefined();
  const detail = NH.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
  expect(detail.manga.chapters?.length).toBe(1);
  const chapter = NH.handleChapter(detailResponse.data, mangaId, '1', 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images.length).toBeGreaterThan(0);
  const imageResponse = await fetch(chapter.chapter.images[0].uri, {
    headers: chapter.chapter.headers,
  });
  expect(imageResponse.ok).toBe(true);
  expect(imageResponse.headers.get('content-type')).toMatch(/^image\//);
});

liveTest('Bika 实时签名请求到达认证边界', async () => {
  const response = await fetchData(Bika.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = Bika.handleDiscovery(response.data);
  expect(result.error?.message).toContain('Token');
});

liveTest('肉漫屋实时列表、详情与章节可请求并解析', async () => {
  const response = await fetchData(
    RM5.prepareDiscoveryFetch(1, {
      type: '$$DEFAULT$$',
      status: '$$DEFAULT$$',
      sort: '$$DEFAULT$$',
    })
  );
  expect(response.error).toBeUndefined();
  const result = RM5.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);

  const mangaId = result.discovery[0].mangaId;
  const searchResponse = await fetchData(
    RM5.prepareSearchFetch(result.discovery[0].title || '', 1, {})
  );
  expect(searchResponse.error).toBeUndefined();
  const search = RM5.handleSearch(searchResponse.data) as { search: IncreaseManga[] };
  expect(search.search.some((item) => item.mangaId === mangaId)).toBe(true);

  const detailResponse = await fetchData(RM5.prepareMangaInfoFetch(mangaId));
  expect(detailResponse.error).toBeUndefined();
  const detail = RM5.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
  expect(detail.manga.chapters?.length).toBeGreaterThan(0);

  const chapterId = detail.manga.chapters?.at(-1)?.chapterId || '0';
  const chapterResponse = await fetchData(RM5.prepareChapterFetch(mangaId, chapterId, 1, {}));
  expect(chapterResponse.error).toBeUndefined();
  const chapter = RM5.handleChapter(chapterResponse.data, mangaId, chapterId, 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images.length).toBeGreaterThan(0);
  expect(chapter.chapter.images.every((item) => item.uri.startsWith('https://'))).toBe(true);
  expect(chapter.chapter.images.every((item) => /\/sr:[01]\//.test(item.uri))).toBe(true);
});
