import { expect, test } from '@jest/globals';
import { fetchData } from '~/utils';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';

const liveTest = process.env.RUN_LIVE_SOURCE_TESTS === '1' ? test : test.skip;

liveTest('HComic 实时列表可请求并解析', async () => {
  const response = await fetchData(HComic.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = HComic.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);
  const mangaId = result.discovery[0].mangaId;
  expect(mangaId).toBeTruthy();

  const detailResponse = await fetchData(HComic.prepareMangaInfoFetch(mangaId));
  expect(detailResponse.error).toBeUndefined();
  const detail = HComic.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
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
});

liveTest('NHentai 实时列表可请求并解析', async () => {
  const response = await fetchData(NH.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = NH.handleDiscovery(response.data) as { discovery: IncreaseManga[] };
  expect(result.discovery.length).toBeGreaterThan(0);
  expect(result.discovery[0].bookCover).toContain('t.nhentai.net/');

  const mangaId = result.discovery[0].mangaId;
  const detailResponse = await fetchData(NH.prepareMangaInfoFetch(mangaId));
  expect(detailResponse.error).toBeUndefined();
  const detail = NH.handleMangaInfo(detailResponse.data, mangaId) as { manga: IncreaseManga };
  expect(detail.manga.chapters?.length).toBe(1);
  const chapter = NH.handleChapter(detailResponse.data, mangaId, '1', 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images.length).toBeGreaterThan(0);
});

liveTest('Bika 实时签名请求到达认证边界', async () => {
  const response = await fetchData(Bika.prepareDiscoveryFetch(1, {}));
  expect(response.error).toBeUndefined();
  const result = Bika.handleDiscovery(response.data);
  expect(result.error?.message).toContain('Token');
});
