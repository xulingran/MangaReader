import { expect, test } from '@jest/globals';
import { Plugin, PluginMap } from '~/plugins';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';

const hcomicItem = {
  _id: 'mongo-1',
  id: '123',
  media_id: '456',
  comic_source: 'MMCG_SHORT',
  num_pages: 2,
  thumbnail: 'https://h-comic.link/api/mms/456',
  title: { display: 'HComic 测试漫画' },
  upload_date: 1_700_000_000,
  tags: [
    { type: 'artist', name: '作者甲' },
    { type: 'tag', name: 'tag', name_zh: '标签' },
  ],
};

const hcomicHtml = `<script>data: [null, {data: {comics: [${JSON.stringify(
  hcomicItem
)}], comic: ${JSON.stringify(hcomicItem)}}}], form: {}</script>`;

test('注册四个新增漫画源', () => {
  expect(Array.from(PluginMap.keys())).toEqual(
    expect.arrayContaining([Plugin.HCOMIC, Plugin.BIKA, Plugin.NH, Plugin.MOEIMG])
  );
});

test('HComic 解析页面负载并生成单话图片地址', () => {
  const discovery = HComic.handleDiscovery(hcomicHtml) as { discovery: IncreaseManga[] };
  expect(discovery.discovery[0]).toMatchObject({
    mangaId: '123',
    title: 'HComic 测试漫画',
    bookCover: 'https://h-comic.link/api/mms/456',
    author: ['作者甲'],
    tag: ['标签'],
  });

  const chapter = HComic.handleChapter(hcomicHtml, '123', '1', 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images).toEqual([
    { uri: 'https://h-comic.link/api/mms/456/pages/1' },
    { uri: 'https://h-comic.link/api/mms/456/pages/2' },
  ]);
});

test('MoeImg 解析列表、详情与阅读图片', () => {
  const discovery = MoeImg.handleDiscovery({
    manga_list: [
      {
        manga_id: 288926,
        manga_name: 'MoeImg 测试漫画',
        manga_cover_img: 'https://moeimg.fan/cover.webp',
        language: 'chinese',
      },
    ],
  }) as { discovery: IncreaseManga[] };
  expect(discovery.discovery[0]).toMatchObject({ mangaId: '288926', title: 'MoeImg 测试漫画' });

  const detail = MoeImg.handleMangaInfo(
    {
      detail: {
        manga_id: 288926,
        manga_name: 'MoeImg 测试漫画',
        manga_cover_img: 'https://moeimg.fan/cover.webp',
        category: 'doujinshi',
        language: 'chinese',
      },
      tags: [{ tag_name: '全彩' }],
      authors: [{ author_name: '作者乙' }],
      chapters: [{ chapter_id: '294777', chapter_title: '' }],
    },
    '288926'
  ) as { manga: IncreaseManga };
  expect(detail.manga.chapters?.[0]).toMatchObject({ chapterId: '294777', title: '全一话' });

  const chapter = MoeImg.handleChapter(
    {
      chapter_detail: {
        manga_name: 'MoeImg 测试漫画',
        chapter_id: '294777',
        server: 'https://cdn.example/',
        chapter_content:
          '<img data-url="data/path/001.webp"><img data-src="https://cdn2.example/002.webp">',
      },
    },
    '288926',
    '294777',
    1
  ) as { chapter: Chapter };
  expect(chapter.chapter.images).toEqual([
    { uri: 'https://cdn.example/data/path/001.webp' },
    { uri: 'https://cdn2.example/002.webp' },
  ]);
});

test('NHentai 解析 API v2 列表和详情图片', () => {
  const discovery = NH.handleDiscovery({
    result: [
      {
        id: 665425,
        media_id: '4060527',
        japanese_title: 'NH 测试漫画',
        thumbnail: 'galleries/4060527/thumb.jpg.webp',
        num_pages: 2,
      },
    ],
  }) as { discovery: IncreaseManga[] };
  expect(discovery.discovery[0]).toMatchObject({
    mangaId: '665425',
    title: 'NH 测试漫画',
    bookCover: 'https://t.nhentai.net/galleries/4060527/thumb.jpg.webp',
  });

  const chapter = NH.handleChapter(
    {
      id: 665425,
      title: { pretty: 'NH 测试漫画' },
      pages: [
        { number: 1, path: 'galleries/4060527/1.jpg' },
        { number: 2, path: 'galleries/4060527/2.webp' },
      ],
    },
    '665425',
    '1',
    1
  ) as { chapter: Chapter };
  expect(chapter.chapter.images).toEqual([
    { uri: 'https://i.nhentai.net/galleries/4060527/1.jpg' },
    { uri: 'https://i.nhentai.net/galleries/4060527/2.webp' },
  ]);
});

test('Bika 使用参考协议签名并解析章节分页', () => {
  Bika.syncExtraData({ bikaToken: 'token-for-test' });
  const request = Bika.prepareDiscoveryFetch(2, { sort: 'dd' });
  expect(request.url).toBe('https://picaapi.picacomic.com/comics');
  expect(request.headers?.get('api-key')).toBe('C69BAF41DA5ABD1FFEDC6D2FEA56B');
  expect(request.headers?.get('authorization')).toBe('token-for-test');
  expect(request.headers?.get('signature')).toMatch(/^[a-f0-9]{64}$/);

  const chapterList = Bika.handleChapterList(
    {
      code: 200,
      data: {
        eps: {
          docs: [
            { order: 1, title: '第一话' },
            { order: 2, title: '第二话' },
          ],
          page: 1,
          pages: 2,
          total: 2,
          limit: 1,
        },
      },
    },
    'comic-1'
  ) as { chapterList: ChapterItem[]; canLoadMore: boolean };
  expect(chapterList.canLoadMore).toBe(true);
  expect(chapterList.chapterList.map((item) => item.chapterId)).toEqual(['1', '2']);

  const chapter = Bika.handleChapter(
    {
      code: 200,
      data: {
        pages: {
          docs: [
            {
              media: {
                fileServer: 'https://storage1.picacomic.com',
                path: 'tobe/comic-1/001.jpg',
              },
            },
          ],
          page: 1,
          pages: 1,
        },
      },
    },
    'comic-1',
    '1',
    1
  ) as { chapter: Chapter };
  expect(chapter.chapter.images).toEqual([
    { uri: 'https://storage1.picacomic.com/static/tobe/comic-1/001.jpg' },
  ]);

  Bika.syncExtraData({});
  expect(Bika.prepareDiscoveryFetch(1, { sort: 'dd' }).headers?.get('authorization')).toBe('');
});
