import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Plugin, PluginMap } from '~/plugins';
import HComic from '~/plugins/hcomic';
import Bika from '~/plugins/bika';
import NH from '~/plugins/nh';
import MoeImg from '~/plugins/moeimg';
import RM5 from '~/plugins/rm5';
import MBZ from '~/plugins/mbz';
import { MangaStatus, ErrorMessage } from '~/utils';
import { SecureToken } from '~/utils/secureToken';
import CryptoJS from 'crypto-js';

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
