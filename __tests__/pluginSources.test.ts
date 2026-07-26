import { expect, test } from '@jest/globals';
import { Plugin, PluginMap } from '~/plugins';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';
import RM5 from '~/plugins/rm5';
import MBZ from '~/plugins/mbz';
import { MangaStatus, ErrorMessage } from '~/utils';

const hcomicItem = {
  _id: 'mongo-1',
  id: '123',
  media_id: '456',
  comic_source: 'MMCG_SHORT',
  num_pages: 2,
  thumbnail: 'https://h-comic.link/api/mms/456',
  title: { english: 'HComic 测试漫画', display: 'HComic 测试漫画' },
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
  expect(discovery.discovery[0].href).toBe(
    'https://h-comic.com/comics/123?id=123'
  );
  expect(HComic.prepareMangaInfoFetch('123', discovery.discovery[0]).url).toBe(
    'https://h-comic.com/comics/123/1?id=123'
  );

  const detail = HComic.handleMangaInfo(hcomicHtml, '123') as { manga: IncreaseManga };
  expect(detail.manga.chapters?.[0]).toMatchObject({ title: '全一话' });

  const chapter = HComic.handleChapter(hcomicHtml, '123', '1', 1) as {
    chapter: Chapter;
  };
  expect(chapter.chapter.images).toEqual([
    { uri: 'https://h-comic.link/api/mms/456/pages/1' },
    { uri: 'https://h-comic.link/api/mms/456/pages/2' },
  ]);
  expect(() => HComic.handleMangaInfo(hcomicHtml, '999')).toThrow(
    'HComic 返回了错误的漫画数据'
  );
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
  expect(() =>
    MoeImg.handleChapter(
      { chapter_detail: { chapter_id: '294777', chapter_content: '' } },
      '288926',
      '294777',
      1
    )
  ).toThrow('图片数据缺失');
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
    bookCover: 'https://h-comic.link/api/nh/4060527',
  });

  const chapter = NH.handleChapter(
    {
      id: 665425,
      media_id: '4060527',
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
    { uri: 'https://h-comic.link/api/nh/4060527/pages/1' },
    { uri: 'https://h-comic.link/api/nh/4060527/pages/2' },
  ]);
  expect(() =>
    NH.handleChapter({ id: 665425, pages: [] }, '665425', '1', 1)
  ).toThrow('NHentai 图片数据缺失');
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

test('Bika 账号密码登录请求签名并解析 Token', () => {
  const request = Bika.prepareLoginFetch('testuser', 'secret');
  expect(request.url).toBe('https://picaapi.picacomic.com/auth/sign-in');
  expect(request.method).toBe('POST');
  // API 的 email 字段传的是账户名
  expect(request.body).toEqual({ email: 'testuser', password: 'secret' });
  expect(request.headers?.get('api-key')).toBe('C69BAF41DA5ABD1FFEDC6D2FEA56B');
  expect(request.headers?.get('signature')).toMatch(/^[a-f0-9]{64}$/);

  const success = Bika.handleLogin({ code: 200, data: { token: ' jwt-token ' } }) as {
    token: string;
  };
  expect(success.token).toBe('jwt-token');

  const wrongPassword = Bika.handleLogin({ code: 401, message: 'invalid' }) as { error: Error };
  expect(wrongPassword.error.message).toBe(ErrorMessage.LoginFailBIKA);

  const missing = Bika.handleLogin({ code: 200, data: {} }) as { error: Error };
  expect(missing.error.message).toBe('哔咔登录响应缺少 Token');
});

test('肉漫屋适配新版列表、零基分页与搜索结果', () => {
  const listHtml = `
    <a href="/books/rm5-book-1">
      <div class="sm:hidden">
        <div style="background-image:url(&quot;https://r5.rmcdn10.xyz/cover.webp&quot;)"></div>
        <div class="truncate text-foreground">肉漫屋测试漫画</div>
        <div>7/19/2026</div>
      </div>
    </a>
  `;
  const discoveryRequest = RM5.prepareDiscoveryFetch(1, {
    type: '$$DEFAULT$$',
    status: '$$DEFAULT$$',
    sort: '$$DEFAULT$$',
  });
  const searchRequest = RM5.prepareSearchFetch('测试', 2, {});
  expect((discoveryRequest.body as Record<string, unknown>).page).toBe(0);
  expect((searchRequest.body as Record<string, unknown>).page).toBe(1);

  const discovery = RM5.handleDiscovery(listHtml) as { discovery: IncreaseManga[] };
  const search = RM5.handleSearch(listHtml) as { search: IncreaseManga[] };
  expect(discovery.discovery[0]).toMatchObject({
    mangaId: 'rm5-book-1',
    title: '肉漫屋测试漫画',
    bookCover: 'https://r5.rmcdn10.xyz/cover.webp',
    updateTime: '2026-07-19',
  });
  expect(search.search).toEqual(discovery.discovery);
});

test('肉漫屋解析新版详情页与章节目录', () => {
  const detailHtml = `
    <div class="flex">
      <div><img src="https://r5.rmcdn10.xyz/cover.webp" alt="肉漫屋测试漫画 cover"></div>
      <div class="basis-3/5">
        <div class="text-xl text-foreground">肉漫屋测试漫画</div>
        <div><div>作者: <span>测试作者</span></div></div>
        <div><div>狀態: <span>連載中</span></div></div>
        <div><div>標籤: <span><a>标签甲</a><a>标签乙</a></span></div></div>
        <div>7/19/2026</div>
      </div>
    </div>
    <a href="/books/rm5-book-1/0">開始閱讀</a>
    <a href="/books/rm5-book-1/0"><div class="truncate">第一话</div></a>
    <a href="/books/rm5-book-1/1"><div class="truncate">第二话</div></a>
  `;

  const detail = RM5.handleMangaInfo(detailHtml, 'rm5-book-1') as { manga: IncreaseManga };
  expect(detail.manga).toMatchObject({
    mangaId: 'rm5-book-1',
    title: '肉漫屋测试漫画',
    latest: '第二话',
    updateTime: '2026-07-19',
    author: ['测试作者'],
    tag: ['标签甲', '标签乙'],
    status: MangaStatus.Serial,
  });
  expect(detail.manga.chapters?.map((item) => item.chapterId)).toEqual(['1', '0']);
});

test('肉漫屋还原拆分的 Flight 数据并识别图片扰乱标记', () => {
  const firstChunk = '1:["$","div",null,{"imageUrl":"https://r5.rmcdn10.xyz/m/split';
  const secondChunk =
    '/sr:1/001.webp"}]\n2:["$","div",null,{"imageUrl":"https://r5.rmcdn11.xyz/m/full/sr:0/002.webp"}]';
  const chapterHtml = `
    <main>
      <div class="px-1">
        <div class="text-lg text-foreground flex justify-center">肉漫屋测试漫画</div>
        <div class="text-foreground flex justify-center">第一话</div>
      </div>
    </main>
    <script>self.__next_f.push(${JSON.stringify([1, firstChunk])})</script>
    <script>self.__next_f.push(${JSON.stringify([1, secondChunk])})</script>
  `;

  const result = RM5.handleChapter(chapterHtml, 'rm5-book-1', '0', 1) as {
    chapter: Chapter;
    canLoadMore: boolean;
  };
  expect(result.canLoadMore).toBe(false);
  expect(result.chapter).toMatchObject({
    name: '肉漫屋测试漫画',
    title: '第一话',
  });
  expect(result.chapter.images).toEqual([
    {
      uri: 'https://r5.rmcdn10.xyz/m/split/sr:1/001.webp',
      needUnscramble: true,
    },
    {
      uri: 'https://r5.rmcdn11.xyz/m/full/sr:0/002.webp',
      needUnscramble: false,
    },
  ]);
});

test('漫画bz 详情页缺失 MANGABZ_COMIC_MID 脚本时抛错', () => {
  // 旧版实现会把空 id 兜底成 'bz'，生成无效 mangaId；新版显式抛错避免脏数据进入 dict。
  const htmlWithoutScript = `
    <html><body>
      <div class="detail-info"><p class="detail-info-title">无脚本详情</p></div>
    </body></html>
  `;
  expect(() => MBZ.handleMangaInfo(htmlWithoutScript, 'whatever')).toThrow(
    `漫画bz ${ErrorMessage.MissingMangaInfo}`
  );

  // 合法脚本存在时仍能正常解析出 mangaId（数字 id + 'bz' 后缀）
  const htmlWithScript = `
    <html><body>
      <script>var MANGABZ_COMIC_MID=123456;</script>
      <div class="detail-info">
        <img class="detail-info-cover" src="https://mangabz.com/cover.webp">
        <p class="detail-info-title">漫画bz 测试</p>
        <div class="detail-info-tip"><span><a>作者甲</a></span><span>连载</span><span><a>标签</a></span></div>
      </div>
    </body></html>
  `;
  const detail = MBZ.handleMangaInfo(htmlWithScript, '123456bz') as { manga: IncreaseManga };
  expect(detail.manga.mangaId).toBe('123456bz');
  expect(detail.manga.title).toBe('漫画bz 测试');
});
