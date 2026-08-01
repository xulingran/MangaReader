import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Plugin, PluginMap } from '~/plugins';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';
import RM5 from '~/plugins/rm5';
import MBZ from '~/plugins/mbz';
import BZM from '~/plugins/bzm';
import MHGM, { __test__ as mhgmHelpers } from '~/plugins/mhgm';
import MANHUAUK, { __test__ as manhuaukHelpers } from '~/plugins/manhuauk';
import { MangaStatus, ErrorMessage } from '~/utils';
import { SecureToken } from '~/utils/secureToken';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// 生产环境在 index.js 里给 dayjs 注册 customParseFormat（bzm 用 'YYYY年MM月DD日' 解析），
// jest 不加载 index.js，这里对齐注册，使时间格式分支可在测试中走通。
dayjs.extend(customParseFormat);

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

test('Bika 在线收藏夹请求带签名与排序并复用列表解析', () => {
  Bika.syncExtraData({ bikaToken: 'token-for-test' });
  const request = Bika.prepareFavoritesFetch?.(2);
  expect(request?.url).toBe('https://picaapi.picacomic.com/users/favourite');
  expect(request?.body).toEqual({ page: 2, s: 'dd' });
  expect(request?.headers?.get('authorization')).toBe('token-for-test');
  expect(request?.headers?.get('signature')).toMatch(/^[a-f0-9]{64}$/);

  const favorites = Bika.handleFavorites?.({
    code: 200,
    data: {
      comics: {
        docs: [
          {
            _id: 'comic-1',
            title: '哔咔收藏漫画',
            author: '作者甲,作者乙',
            categories: ['全彩'],
            thumb: { fileServer: 'https://storage1.picacomic.com', path: 'tobe/comic-1/cover.jpg' },
          },
        ],
        page: 1,
        pages: 1,
      },
    },
  }) as { favorites: IncreaseManga[] };
  expect(favorites.favorites[0]).toMatchObject({
    mangaId: 'comic-1',
    title: '哔咔收藏漫画',
    author: ['作者甲', '作者乙'],
    bookCover: 'https://storage1.picacomic.com/static/tobe/comic-1/cover.jpg',
  });

  const unauthorized = Bika.handleFavorites?.({ code: 401 }) as { error: Error };
  expect(unauthorized.error.message).toBe(ErrorMessage.AuthFailBIKA);
  Bika.syncExtraData({});
});

test('NHentai 在线收藏夹需要 API Key 并解析官方响应', () => {
  NH.syncExtraData({});
  expect(() => NH.prepareFavoritesFetch?.(1)).toThrow(ErrorMessage.MissingApiKeyNH);

  NH.syncExtraData({ nhApiKey: ' api-key-for-test ' });
  const request = NH.prepareFavoritesFetch?.(3);
  expect(request?.url).toBe('https://nhentai.net/api/v2/favorites');
  expect(request?.body).toEqual({ page: 3 });
  expect(request?.headers?.get('Authorization')).toBe('Key api-key-for-test');
  expect(request?.authErrorMessage).toBe(ErrorMessage.AuthFailNH);

  const favorites = NH.handleFavorites?.({
    result: [
      {
        id: 665425,
        media_id: '4060527',
        japanese_title: 'NH 收藏漫画',
        thumbnail: 'galleries/4060527/thumb.jpg.webp',
        num_pages: 2,
      },
    ],
    num_pages: 1,
  }) as { favorites: IncreaseManga[] };
  expect(favorites.favorites[0]).toMatchObject({
    mangaId: '665425',
    title: 'NH 收藏漫画',
    bookCover: 'https://h-comic.link/api/nh/4060527',
  });

  expect(() => NH.handleFavorites?.({})).toThrow(ErrorMessage.WrongPageStructure);
  NH.syncExtraData({});
  expect(() => NH.prepareFavoritesFetch?.(1)).toThrow(ErrorMessage.MissingApiKeyNH);
});

test('HComic 在线收藏夹需要登录凭据并解析 docs 结构', () => {
  HComic.syncExtraData({});
  expect(() => HComic.prepareFavoritesFetch?.(1)).toThrow(ErrorMessage.MissingTokenHCOMIC);

  HComic.syncExtraData({ hcomicToken: ' token-for-test ' });
  const request = HComic.prepareFavoritesFetch?.(2);
  expect(request?.url).toBe('https://api.h-comic.com/api/favourites');
  expect(request?.body).toEqual({ page: 2, limit: 20 });
  expect(request?.headers?.get('Authorization')).toBe('Bearer token-for-test');
  expect(request?.headers?.get('Origin')).toBe('https://h-comic.com');
  expect(request?.authErrorMessage).toBe(ErrorMessage.AuthFailHCOMIC);

  const favorites = HComic.handleFavorites?.({
    docs: [{ comic: hcomicItem }, { comic: null }, {}],
    totalDocs: 1,
    totalPages: 1,
  }) as { favorites: IncreaseManga[] };
  expect(favorites.favorites).toHaveLength(1);
  expect(favorites.favorites[0]).toMatchObject({
    mangaId: '123',
    title: 'HComic 测试漫画',
    bookCover: 'https://h-comic.link/api/mms/456',
  });

  expect(() => HComic.handleFavorites?.({})).toThrow(ErrorMessage.WrongPageStructure);
  HComic.syncExtraData({});
  expect(() => HComic.prepareFavoritesFetch?.(1)).toThrow(ErrorMessage.MissingTokenHCOMIC);
});

describe('HComic Auth0 PKCE 账号密码登录', () => {
  const originalFetch = global.fetch;

  const mockResponse = (init: {
    status?: number;
    url?: string;
    headers?: Record<string, string>;
    text?: string;
    json?: unknown;
  }) =>
    ({
      status: init.status ?? 200,
      url: init.url ?? '',
      headers: new Headers(init.headers),
      text: () => Promise.resolve(init.text ?? ''),
      json: () => Promise.resolve(init.json ?? {}),
    } as unknown as Response);

  const mockFetch = jest.fn<typeof fetch>();
  const loginPageUrl =
    'https://h-comic.auth0.com/u/login?state=internal-state&client=06o2Ynemb0DbDy8RBImlEGbyta1gT7mS';

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    // jest 环境 Platform.OS 非 android，stub 掉原生 SecureRandom 桥
    jest.spyOn(SecureToken, 'createSessionNonce').mockReturnValue('secure-test-nonce');
  });
  afterAll(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('完整 PKCE 流程换回 access_token', async () => {
    mockFetch
      // 1. GET /authorize → 自动跟随到登录页
      .mockResolvedValueOnce(
        mockResponse({
          url: loginPageUrl,
          text: '<form><input type="hidden" name="state" value="form-state-1" /></form>',
        })
      )
      // 2. POST 登录表单 → 302（OkHttp 不跟随 POST 重定向）
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          url: loginPageUrl,
          headers: { location: '/authorize/resume?state=internal-state' },
        })
      )
      // 3. GET 回调链 → 自动跟到 h-comic.com，授权码在最终 URL 上
      .mockResolvedValueOnce(
        mockResponse({ url: 'https://h-comic.com/?code=auth-code-1&state=oauth-state' })
      )
      // 4. POST /oauth/token
      .mockResolvedValueOnce(mockResponse({ json: { access_token: 'hcomic-access-token' } }));

    const token = await HComic.performLogin?.('test@example.com', 'secret');
    expect(token).toBe('hcomic-access-token');
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // authorize 请求携带 PKCE 参数
    const [authorizeUrl] = mockFetch.mock.calls[0] as [string];
    expect(authorizeUrl).toContain('https://h-comic.auth0.com/authorize?');
    expect(authorizeUrl).toContain('code_challenge=');
    expect(authorizeUrl).toContain('code_challenge_method=S256');
    expect(authorizeUrl).toContain(encodeURIComponent('https://h-comic.com'));

    // 登录表单提交到登录页 URL，带 form state 与账密
    const [loginUrl, loginInit] = mockFetch.mock.calls[1] as [string, { body: string }];
    expect(loginUrl).toBe(loginPageUrl);
    expect(loginInit.body).toContain('state=form-state-1');
    expect(loginInit.body).toContain('username=test%40example.com');
    expect(loginInit.body).toContain('password=secret');

    // code_verifier 与 code_challenge 配对（S256）
    const [, tokenInit] = mockFetch.mock.calls[3] as [string, { body: string }];
    const tokenBody = JSON.parse(tokenInit.body);
    expect(tokenBody.code).toBe('auth-code-1');
    expect(tokenBody.grant_type).toBe('authorization_code');
    const challenge = /code_challenge=([^&]+)/.exec(authorizeUrl)?.[1] || '';
    expect(
      CryptoJS.SHA256(tokenBody.code_verifier)
        .toString(CryptoJS.enc.Base64)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/[=]+$/, '')
    ).toBe(decodeURIComponent(challenge));
  });

  test('密码错误时 Auth0 返回 200 错误页', async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({
          url: loginPageUrl,
          text: '<input type="hidden" name="state" value="form-state-2" />',
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          url: loginPageUrl,
          text: '<div><span class="ulp-error-message">Wrong email or password</span></div>',
        })
      );

    await expect(HComic.performLogin?.('test@example.com', 'bad')).rejects.toThrow(
      'Wrong email or password'
    );
  });

  test('登录被拒重定向回 Auth0 登录页时报账号密码错误', async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({
          url: loginPageUrl,
          text: '<input value="form-state-3" type="hidden" name="state" />',
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          url: loginPageUrl,
          headers: { location: 'https://h-comic.auth0.com/u/login?state=internal-state' },
        })
      );

    await expect(HComic.performLogin?.('test@example.com', 'bad')).rejects.toThrow(
      '登录失败：账号或密码错误'
    );
  });
});

// ---------------------------------------------------------------------------
// manhua.uk（turbo-stream + 游标分页 + 单章节）
// 真实抓包样本驱动（见 __tests__/fixtures/manhuauk/），避免手算 turbo-stream 索引
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';

const UK_FIXTURES_DIR = join(__dirname, 'fixtures', 'manhuauk');
const loadUkFixture = (name: string): string =>
  readFileSync(join(UK_FIXTURES_DIR, name), 'utf-8');

// search.data 为 q=test 的搜索结果（total=12，首页返回 11 条，每条含 paginationToken）
const UK_SEARCH_PAYLOAD = loadUkFixture('search.data');
// detail.data 为单本漫画详情（_id=667f0f58af6b0de9f6654fe8，images 71 张）
const UK_DETAIL_ID = '667f0f58af6b0de9f6654fe8';
const UK_DETAIL_PAYLOAD = loadUkFixture('detail.data');

test('manhua.uk 注册到 PluginMap', () => {
  expect(PluginMap.has(Plugin.MANHUAUK)).toBe(true);
  // 语言筛选用 setting.chineseOnly 开关控制（saga 注入 language=zh），
  // 不在发现页/搜索栏暴露下拉
  expect(MANHUAUK.option.discovery).toEqual([]);
  expect(MANHUAUK.option.search).toEqual([]);
});

test('manhua.uk 游标分页：首页不带 next，解析后回填链尾游标', () => {
  const page1 = MANHUAUK.prepareDiscoveryFetch(1, {});
  // GET + body 被 fetchData 拼成查询串；首页不应含 next
  expect((page1.body as Record<string, unknown>).next).toBeUndefined();

  const { discovery } = MANHUAUK.handleDiscovery(UK_SEARCH_PAYLOAD) as {
    discovery: IncreaseManga[];
  };
  expect(discovery.length).toBe(11);
  expect(discovery[0]).toMatchObject({
    mangaId: '667f0f58af6b0de9f6654fe8',
    status: MangaStatus.End,
  });
  // 封面拼 image 前缀
  expect(discovery[0].bookCover?.startsWith('https://manhua.uk/image')).toBe(true);

  // 第二页 prepare 应回填末条记录的 paginationToken（search.data 末条带该字段）
  const page2 = MANHUAUK.prepareDiscoveryFetch(2, {});
  expect(typeof (page2.body as Record<string, unknown>).next).toBe('string');
  expect((page2.body as Record<string, unknown>).next).not.toBe('');
});

test('manhua.uk 不同筛选 / 关键词的游标链相互隔离', () => {
  // discovery 默认链已写入游标（上一测试）；切换到带 language 筛选的新链
  const zhFilterPage2 = MANHUAUK.prepareDiscoveryFetch(2, { language: 'zh' });
  expect((zhFilterPage2.body as Record<string, unknown>).next).toBeUndefined();
  expect((zhFilterPage2.body as Record<string, unknown>).language).toBe('zh');

  // search 链与 discovery 链也隔离：关键词链页 2 无游标
  const searchReq = MANHUAUK.prepareSearchFetch('关键词', 1, { language: 'zh' });
  expect((searchReq.body as Record<string, unknown>)).toMatchObject({ q: '关键词', language: 'zh' });
  const searchPage2 = MANHUAUK.prepareSearchFetch('关键词', 2, { language: 'zh' });
  expect((searchPage2.body as Record<string, unknown>).next).toBeUndefined();
});

test('manhua.uk 默认筛选项（$$DEFAULT$$）不作为查询参数发送', () => {
  // saga 会把筛选项的 defaultValue（Options.Default = '$$DEFAULT$$'）填入 filter，
  // 表示「不筛选」。必须过滤掉，否则 language=$$DEFAULT$$ 会让站点返回 404。
  const req = MANHUAUK.prepareSearchFetch('mother', 1, { language: '$$DEFAULT$$' });
  expect((req.body as Record<string, unknown>)).toEqual({ q: 'mother' });
  expect((req.body as Record<string, unknown>).language).toBeUndefined();
});

test('manhua.uk 详情解析为单章节「全一话」', () => {
  const { manga } = MANHUAUK.handleMangaInfo(UK_DETAIL_PAYLOAD, UK_DETAIL_ID) as {
    manga: IncreaseManga;
  };
  expect(manga).toMatchObject({
    mangaId: UK_DETAIL_ID,
    status: MangaStatus.End,
  });
  // 单章节：chapterId = mangaId（一本漫画即一章）
  expect(manga.chapters).toEqual([
    {
      hash: `MANHUAUK&${UK_DETAIL_ID}&${UK_DETAIL_ID}`,
      mangaId: UK_DETAIL_ID,
      chapterId: UK_DETAIL_ID,
      href: `https://manhua.uk/zh-CN/comics/${UK_DETAIL_ID}`,
      title: '全一话',
    },
  ]);

  const { chapter } = MANHUAUK.handleChapter(UK_DETAIL_PAYLOAD, UK_DETAIL_ID, UK_DETAIL_ID, 1) as {
    chapter: Chapter;
  };
  // 详情 images 数组直接作为图片列表（detail.data 含 71 张）
  expect(chapter.images.length).toBe(71);
  expect(chapter.images.every((item) => item.uri.startsWith('https://manhua.uk/image'))).toBe(true);
});

test('manhua.uk 非法响应（如 Cloudflare HTML 拦截页）抛友好错误', () => {
  // 命中 Cloudflare 时 fetchData 退回 text（HTML），不是合法 turbo-stream
  const htmlResponse = '<html><title>Just a moment...</title></html>';
  expect(() => MANHUAUK.handleMangaInfo(htmlResponse, 'whatever')).toThrow(
    `manhua.uk ${ErrorMessage.WrongResponse}`
  );
  expect(() => MANHUAUK.handleChapter(htmlResponse, 'whatever', 'whatever', 1)).toThrow(
    `manhua.uk ${ErrorMessage.WrongResponse}`
  );
});

test('manhua.uk 纯函数辅助：图片拼接 / 标签提取 / 分类映射', () => {
  const { buildImageUrl, extractImages, extractTags, mapClassification, lastPaginationToken } =
    manhuaukHelpers;
  // 完整 URL 原样返回，相对路径拼前缀并补 /
  expect(buildImageUrl('https://cdn.example/x.webp')).toBe('https://cdn.example/x.webp');
  expect(buildImageUrl('/img/1.webp')).toBe('https://manhua.uk/image/img/1.webp');
  expect(buildImageUrl('img/1.webp')).toBe('https://manhua.uk/image/img/1.webp');
  expect(buildImageUrl('')).toBe('');

  expect(extractImages(['/a.webp', 'https://x/2.webp', '', null])).toEqual([
    'https://manhua.uk/image/a.webp',
    'https://x/2.webp',
  ]);

  // 标签：字符串与 {name} 对象混排
  expect(extractTags([' 甲 ', { name: '乙' }, { name: '' }, null, 1])).toEqual(['甲', '乙']);

  // 分类：已知 key 翻译，未知原样透传，非字符串返回空
  expect(mapClassification('booklet')).toBe('单行本');
  expect(mapClassification('korean_comics')).toBe('韩漫');
  expect(mapClassification('custom')).toBe('custom');
  expect(mapClassification(null)).toBe('');

  // 游标：优先 paginationToken，回退 _id
  expect(lastPaginationToken([{ _id: 'a', paginationToken: 'tok' }])).toBe('tok');
  expect(lastPaginationToken([{ _id: 'a' }])).toBe('a');
  expect(lastPaginationToken([])).toBe('');
});

// ===================== BZM（包子漫画）解析 =====================
describe('BZM 插件解析', () => {  describe('handleDiscovery', () => {
    it('JSON 输入：字段映射、bookCover 组装、combineHash 哈希', () => {
      const res = {
        items: [
          {
            author: '作者甲',
            comic_id: 'yinianshiguang',
            name: '一年时光',
            region: 'cn' as const,
            region_name: '国漫',
            topic_img: 'cover/yinianshiguang.jpg',
            type_names: ['古风', '恋爱'],
          },
        ],
        next: '',
      };
      const result = BZM.handleDiscovery(res as any) as { discovery: IncreaseManga[] };
      expect(result.discovery).toHaveLength(1);
      expect(result.discovery[0]).toMatchObject({
        mangaId: 'yinianshiguang',
        title: '一年时光',
        author: ['作者甲'],
        tag: ['古风', '恋爱'],
        href: 'https://cn.baozimhcn.com/comic/yinianshiguang',
        bookCover: 'https://static-tw.baozimh.com/cover/cover/yinianshiguang.jpg',
      });
    });

    it('字符串输入（命中 Cloudflare 的 HTML）→ 抛 CloudflareFail（而非旧实现的 res.items.map TypeError）', () => {
      // bugfix：先 typeof res === 'string' 分流进 checkCloudFlare，避免在字符串上 res.items.map 抛 TypeError
      const cfHtml = '<html><head><title>Just a moment...</title></head><body></body></html>';
      expect(() => BZM.handleDiscovery(cfHtml)).toThrow(ErrorMessage.CloudflareFail);
    });
  });

  describe('handleSearch', () => {
    it('解析 classify-items 列表：mangaId 正则提取、cover 去参、tag 数组', () => {
      const html = `
        <div class="classify-items">
          <div>
            <a class="comics-card__poster" href="/comic/yinianshiguang">
              <amp-img src="https://x.test/cover.jpg?token=1"></amp-img>
              <div class="tabs"><span class="tab">古风</span><span class="tab">恋爱</span></div>
            </a>
            <div class="comics-card__info">
              <div class="tags">作者乙</div>
              <div class="comics-card__title">一年时光</div>
            </div>
          </div>
        </div>`;
      const result = BZM.handleSearch(html) as { search: IncreaseManga[] };
      expect(result.search).toHaveLength(1);
      expect(result.search[0]).toMatchObject({
        mangaId: 'yinianshiguang',
        title: '一年时光',
        author: ['作者乙'],
        tag: ['古风', '恋爱'],
        bookCover: 'https://x.test/cover.jpg', // 去掉了 ?token=1
        href: 'https://cn.baozimhcn.com/comic/yinianshiguang',
      });
    });
  });

  describe('handleMangaInfo', () => {
    // 构造一个最小但覆盖关键分支的详情页 HTML
    const buildDetailHtml = (updateTimeLabel: string, extraTags: string[] = []) => {
      const tagsHtml = ['古风', ...extraTags]
        .map((t) => `<span class="tag">${t}</span>`)
        .join('');
      return `
        <html>
        <head>
          <meta name="og:url" content="https://cn.baozimhcn.com/comic/yinianshiguang">
          <title>一年时光</title>
        </head>
        <body>
          <div class="comics-detail"><div class="l-content">
            <amp-img src="https://x.test/info-cover.jpg?v=2"></amp-img>
            <div class="comics-detail__info">
              <div class="comics-detail__title">一年时光</div>
              <div class="comics-detail__author">作者甲</div>
              <div class="tag-list">${tagsHtml}</div>
            </div>
            <div class="supporting-text">
              <div><a>第100话</a><em>${updateTimeLabel}</em></div>
            </div>
            <div id="chapter-items">
              <div><a href="/comic/chapter?section_slot=0&chapter_slot=1"><span>第1话</span></a></div>
              <div><a href="/comic/chapter?section_slot=0&chapter_slot=2"><span>第2话</span></a></div>
              <div><a href="/comic/chapter?section_slot=0&chapter_slot=3"><span>第3话</span></a></div>
            </div>
          </div></div>
        </body></html>`;
    };

    it('YYYY年MM月DD日 时间格式 → 格式化为 YYYY-MM-DD', () => {
      const result = BZM.handleMangaInfo(buildDetailHtml('2026年08月01日 更新'), 'yinianshiguang') as {
        manga: IncreaseManga;
      };
      expect(result.manga.updateTime).toBe('2026-08-01');
    });

    it('今天 更新 → 当天日期', () => {
      const result = BZM.handleMangaInfo(buildDetailHtml('今天 更新'), 'yinianshiguang') as {
        manga: IncreaseManga;
      };
      expect(result.manga.updateTime).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    });

    it('N小时前 → 当天日期（用固定系统时间断言）', () => {
      const realDate = Date;
      const fixed = new Date('2026-08-01T10:00:00Z');
      // @ts-expect-error 锁定 Date.now，让 subtract(N,'h') 产出确定日期
      global.Date = class extends realDate {
        static now() {
          return fixed.getTime();
        }
      };
      try {
        // 3小时前 → 仍是当天
        const result = BZM.handleMangaInfo(buildDetailHtml('3小时前 更新'), 'yinianshiguang') as {
          manga: IncreaseManga;
        };
        expect(result.manga.updateTime).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      } finally {
        global.Date = realDate;
      }
    });

    it('章节槽哈希：section_slot/chapter_slot 拼成 X_Y，并 reverse 倒序', () => {
      const result = BZM.handleMangaInfo(
        buildDetailHtml('2026年08月01日 更新'),
        'yinianshiguang'
      ) as { manga: IncreaseManga };
      // 输入 1/2/3，reverse 后应为 3/2/1，chapterId 形如 0_3
      const chapters = result.manga.chapters!;
      expect(chapters.map((c) => c.chapterId)).toEqual(['0_3', '0_2', '0_1']);
      expect(chapters.map((c) => c.title)).toEqual(['第3话', '第2话', '第1话']);
    });

    it('标签映射：含「连载中」→ Serial，且从 tag 数组剔除', () => {
      const result = BZM.handleMangaInfo(
        buildDetailHtml('2026年08月01日 更新', ['连载中']),
        'yinianshiguang'
      ) as { manga: IncreaseManga };
      expect(result.manga.status).toBe(MangaStatus.Serial);
      expect(result.manga.tag).not.toContain('连载中');
    });

    it('标签映射：含「已完结」→ End，且从 tag 数组剔除', () => {
      const result = BZM.handleMangaInfo(
        buildDetailHtml('2026年08月01日 更新', ['已完结']),
        'yinianshiguang'
      ) as { manga: IncreaseManga };
      expect(result.manga.status).toBe(MangaStatus.End);
      expect(result.manga.tag).not.toContain('已完结');
    });

    it('缺少 og:url 中的 mangaId → 抛 MissingMangaInfo', () => {
      const html = `<html><head><title>x</title></head><body></body></html>`;
      expect(() => BZM.handleMangaInfo(html, 'whatever')).toThrow(ErrorMessage.MissingMangaInfo);
    });
  });

  describe('handleChapter', () => {
    const buildChapterHtml = (withNext: boolean, images: string[] = []) => {
      // 「下一页」href 须匹配 PATTERN_SLOT_HTML：/{word}_?{n}/{n}_{n}_{n}.html，末段为 pageSlot
      const nextHtml = withNext
        ? `<div class="next_chapter"><a href="/dzmanga_0/0_3_2.html">下一页</a></div>`
        : '';
      const imgHtml = images.map((src) => `<div><amp-img src="${src}"></amp-img></div>`).join('');
      return `
        <html><head><title>第1话</title></head><body>
          <div class="comic-chapter"><div class="header"><div class="l-content"><div class="title">第1话</div></div></div></div>
          <div class="comic-contain">${imgHtml}</div>
          ${nextHtml}
        </body></html>`;
    };

    it('含「下一页」链接（pageSlot>page）→ canLoadMore=true', () => {
      // pageSlot=2 > page=1
      const result = BZM.handleChapter(
        buildChapterHtml(true, ['https://x.test/1.jpg', 'https://x.test/2.jpg']),
        'yinianshiguang',
        '0_1',
        1
      ) as { chapter: any; canLoadMore: boolean };
      expect(result.canLoadMore).toBe(true);
      expect(result.chapter.images.map((i: any) => i.uri)).toEqual([
        'https://x.test/1.jpg',
        'https://x.test/2.jpg',
      ]);
    });

    it('无「下一页」链接 → canLoadMore=false（已是末页）', () => {
      const result = BZM.handleChapter(buildChapterHtml(false), 'yinianshiguang', '0_1', 1) as {
        canLoadMore: boolean;
      };
      expect(result.canLoadMore).toBe(false);
    });
  });
});

// ===================== MHGM（漫画柜mobile）解析 =====================
describe('MHGM 插件解析', () => {
  describe('handleDiscovery', () => {
    it('解析列表：data-src 补 https、状态 连载/完结 映射', () => {
      const html = `
        <ul>
          <li>
            <a href="/comic/123">
              <h3>测试漫画A</h3>
              <div class="thumb"><img data-src="//i.test/a.jpg"><i>连载</i></div>
              <dl><dt>作者</dt><dd>作者甲</dd></dl>
              <dl><dt>类别</dt><dd>热血</dd></dl>
              <dl><dt>最新</dt><dd>第1话</dd></dl>
              <dl><dt>更新</dt><dd>2026-08-01</dd></dl>
            </a>
          </li>
          <li>
            <a href="/comic/456">
              <h3>测试漫画B</h3>
              <div class="thumb"><img data-src="//i.test/b.jpg"><i>完结</i></div>
              <dl><dt>作者</dt><dd>作者乙</dd></dl>
              <dl><dt>类别</dt><dd>校园</dd></dl>
              <dl><dt>最新</dt><dd>第2话</dd></dl>
              <dl><dt>更新</dt><dd>2026-07-01</dd></dl>
            </a>
          </li>
        </ul>`;
      const result = MHGM.handleDiscovery(html) as { discovery: IncreaseManga[] };
      expect(result.discovery).toHaveLength(2);
      expect(result.discovery[0]).toMatchObject({
        mangaId: '123',
        title: '测试漫画A',
        status: MangaStatus.Serial,
        bookCover: 'https://i.test/a.jpg',
      });
      expect(result.discovery[1]).toMatchObject({
        mangaId: '456',
        title: '测试漫画B',
        status: MangaStatus.End,
        bookCover: 'https://i.test/b.jpg',
      });
    });

    it('过滤掉缺 mangaId 或 title 的项：即使缺 <dl> 也不让整页解析崩溃', () => {
      // 修复前：缺 dl 的项会让 authorLabel 解构为 undefined，紧接着 authorLabel.split(',')
      // 抛错，导致整页（含后面的合法项）解析失败。修复后先过滤 mangaId/title，缺 dl 的项直接跳过。
      const html = `
        <ul>
          <li><a href="/not-a-comic"><h3>无ID</h3></a></li>
          <li><a href="/comic/789"><div class="thumb"></div></a></li>
          <li>
            <a href="/comic/100">
              <h3>有效</h3>
              <div class="thumb"><i>连载</i></div>
              <dl><dt>作者</dt><dd>作者</dd></dl>
              <dl><dt>类别</dt><dd>热血</dd></dl>
              <dl><dt>最新</dt><dd></dd></dl>
              <dl><dt>更新</dt><dd></dd></dl>
            </a>
          </li>
        </ul>`;
      const result = MHGM.handleDiscovery(html) as { discovery: IncreaseManga[] };
      expect(result.discovery).toHaveLength(1);
      expect(result.discovery[0].mangaId).toBe('100');
    });
  });

  describe('handleSearch', () => {
    it('解析列表并过滤缺 mangaId/title 的项（缺 <dl> 不再崩溃）', () => {
      const html = `
        <ul id="detail">
          <li><a href="/not-a-comic"><h3>无ID</h3></a></li>
          <li>
            <a href="/comic/200">
              <h3>搜索结果</h3>
              <div class="thumb"><img data-src="//i.test/s.jpg"><i>连载</i></div>
              <dl><dt>作者</dt><dd>作者丙</dd></dl>
              <dl><dt>类别</dt><dd>校园</dd></dl>
              <dl><dt>最新</dt><dd>第5话</dd></dl>
              <dl><dt>更新</dt><dd>2026-08-01</dd></dl>
            </a>
          </li>
        </ul>`;
      const result = MHGM.handleSearch(html) as { search: IncreaseManga[] };
      expect(result.search).toHaveLength(1);
      expect(result.search[0]).toMatchObject({
        mangaId: '200',
        title: '搜索结果',
        status: MangaStatus.Serial,
        bookCover: 'https://i.test/s.jpg',
      });
    });
  });

  describe('handleMangaInfo 常规路径', () => {
    const buildDetailHtml = (statusLabel: string) => `
      <html><head>
        <title>测试漫画</title>
      </head><body>
        <div class="main-bar"><h1>测试漫画</h1></div>
        <div class="book-detail">
          <div class="thumb"><img src="//i.test/cover.jpg"><i>${statusLabel}</i></div>
        </div>
        <div class="cont-list">
          <dl><dt>最新</dt><dd>第50话</dd></dl>
          <dl><dt>更新</dt><dd>2026-08-01</dd></dl>
          <dl><dt>作者</dt><dd>作者：作者甲</dd></dl>
          <dl><dt>类别</dt><dd>类别：热血</dd></dl>
        </div>
        <script>{ bid:12345, status:0,block_cc:'' }</script>
        <div id="chapterList"><ul>
          <li><a href="/comic/12345/1.html"><b>第1话</b></a></li>
          <li><a href="/comic/12345/2.html"><b>第2话</b></a></li>
        </ul></div>
      </body></html>`;

    it('连载状态 + 章节 href→chapterId 正则提取', () => {
      const result = MHGM.handleMangaInfo(buildDetailHtml('连载'), '12345') as {
        manga: IncreaseManga;
      };
      expect(result.manga.mangaId).toBe('12345');
      expect(result.manga.status).toBe(MangaStatus.Serial);
      const chapters = result.manga.chapters!;
      expect(chapters.map((c) => c.chapterId)).toEqual(['1', '2']);
      expect(chapters[0].href).toBe('https://m.manhuagui.com/comic/12345/1.html');
      expect(result.manga.infoCover).toBe('https://i.test/cover.jpg');
    });

    it('完结状态映射', () => {
      const result = MHGM.handleMangaInfo(buildDetailHtml('完结'), '12345') as {
        manga: IncreaseManga;
      };
      expect(result.manga.status).toBe(MangaStatus.End);
    });

    it('缺 bid → 抛 MissingMangaInfo', () => {
      const html = `<html><head><title>x</title></head><body></body></html>`;
      expect(() => MHGM.handleMangaInfo(html, 'whatever')).toThrow(ErrorMessage.MissingMangaInfo);
    });
  });

  describe('isReaderData 类型守卫', () => {
    const valid = {
      bookId: '1',
      chapterId: '2',
      images: ['a.jpg', 'b.jpg'],
      sl: { host: 'h' },
    };

    it('合法 ReaderData → true', () => {
      expect(mhgmHelpers.isReaderData(valid)).toBe(true);
    });

    it('bookId/chapterId 同时支持 number', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, bookId: 1, chapterId: 2 })).toBe(true);
    });

    it('缺 bookId → false', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, bookId: undefined })).toBe(false);
    });

    it('images 非数组 → false', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, images: 'nope' })).toBe(false);
    });

    it('images 含非字符串元素 → false', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, images: ['a', 2] })).toBe(false);
    });

    it('sl 缺失 → false', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, sl: undefined })).toBe(false);
    });

    it('sl 是数组 → false', () => {
      expect(mhgmHelpers.isReaderData({ ...valid, sl: [] as any })).toBe(false);
    });

    it('非对象输入 → false', () => {
      expect(mhgmHelpers.isReaderData(null)).toBe(false);
      expect(mhgmHelpers.isReaderData('str')).toBe(false);
      expect(mhgmHelpers.isReaderData(undefined)).toBe(false);
    });
  });
});
