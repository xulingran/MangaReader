import Base, { Plugin } from './base';
import { MangaStatus, ErrorMessage } from '~/utils';
import { SecureToken } from '~/utils/secureToken';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import queryString from 'query-string';

interface HComicTag {
  type?: string;
  name?: string;
  name_zh?: string;
}

interface HComicItem {
  _id?: string;
  id?: string | number;
  media_id?: string | number;
  comic_source?: string;
  num_pages?: number;
  images?: { pages?: unknown[] };
  thumbnail?: string;
  title?: {
    display?: string;
    japanese?: string;
    english?: string;
    pretty?: string;
  };
  tags?: HComicTag[];
  upload_date?: number;
}

interface HComicPayload {
  comics?: HComicItem[];
  comic?: HComicItem;
}

const MAX_PAYLOAD_SIZE = 2_000_000;
const payloadPatterns = [
  /data:\s*\[null,\s*(\{[\s\S]*?\})\s*\],\s*form:/,
  /data:\s*\[null,\s*(\{[\s\S]*?\})\s*\],/,
  /data:\s*\[null,\s*(\{[\s\S]*?\})\s*\](?:\s|$)/,
];

// Auth0 配置（Authorization Code + PKCE），与 h-comic.com 网页端一致，并非本项目自己的密钥
const AUTH0_DOMAIN = 'h-comic.auth0.com';
const AUTH0_CLIENT_ID = '06o2Ynemb0DbDy8RBImlEGbyta1gT7mS';
const AUTH0_AUDIENCE = 'https://h-comic.auth0.com/api/v2/';
const AUTH0_SCOPE = 'openid profile email offline_access';
const AUTH0_REDIRECT_URI = 'https://h-comic.com';

const toBase64Url = (input: CryptoJS.lib.WordArray): string =>
  input.toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');

/** 从 Auth0 登录页 HTML 表单中提取 state 隐藏字段的值（兼容 name/value 两种属性顺序） */
function extractFormState(html: string): string {
  const patterns = [
    /<input[^>]+name\s*=\s*["']state["'][^>]+value\s*=\s*["']([^"']+)["']/i,
    /<input[^>]+value\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']state["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) {
      return match[1];
    }
  }
  return '';
}

/** 从 Auth0 错误页 HTML 中提取可读错误信息 */
function extractAuth0Error(html: string): string {
  const match = /<[^>]+class\s*=\s*["'][^"']*(?:error|alert)[^"']*["'][^>]*>([^<]+)/i.exec(html);
  return match?.[1]?.trim() || '';
}

function quoteUnquotedObjectKeys(source: string): string {
  let result = '';
  let position = 0;

  while (position < source.length) {
    const character = source[position];
    if (character === '"' || character === "'") {
      const quote = character;
      result += character;
      position += 1;
      while (position < source.length) {
        const current = source[position];
        result += current;
        position += 1;
        if (current === '\\' && position < source.length) {
          result += source[position];
          position += 1;
        } else if (current === quote) {
          break;
        }
      }
      continue;
    }

    if (character !== '{' && character !== ',') {
      result += character;
      position += 1;
      continue;
    }

    result += character;
    position += 1;
    while (position < source.length && /\s/.test(source[position])) {
      result += source[position];
      position += 1;
    }

    const keyStart = position;
    if (!/[A-Za-z_]/.test(source[position] || '')) {
      continue;
    }
    position += 1;
    while (position < source.length && /[A-Za-z0-9_]/.test(source[position])) {
      position += 1;
    }

    const key = source.slice(keyStart, position);
    const whitespaceStart = position;
    while (position < source.length && /\s/.test(source[position])) {
      position += 1;
    }
    if (source[position] === ':') {
      result += JSON.stringify(key) + source.slice(whitespaceStart, position) + ':';
      position += 1;
    } else {
      result += source.slice(keyStart, position);
    }
  }

  return result;
}

function extractPayload(text: string | null): HComicPayload {
  const source = text || '';
  if (Buffer.byteLength(source, 'utf8') > MAX_PAYLOAD_SIZE) {
    throw new Error(`HComic ${ErrorMessage.ResponseTooLarge}`);
  }

  const match = payloadPatterns.map((pattern) => pattern.exec(source)).find(Boolean);
  if (!match) {
    throw new Error(`HComic ${ErrorMessage.WrongPageStructure}`);
  }

  const envelope = JSON.parse(quoteUnquotedObjectKeys(match[1])) as { data?: HComicPayload };
  if (!envelope.data || typeof envelope.data !== 'object') {
    throw new Error(`HComic ${ErrorMessage.MissingMangaInfo}`);
  }
  return envelope.data;
}

class HComic extends Base {
  private authToken = '';

  constructor() {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    super({
      score: 5,
      id: Plugin.HCOMIC,
      name: 'HComic',
      shortName: 'HComic',
      description: '部分页面需要代理；查看在线收藏夹需点右侧图标账号密码登录，或在 WebView 登录',
      href: 'https://h-comic.com/',
      userAgent,
      defaultHeaders: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://h-comic.com/',
      },
      // 登录态是 Auth0 access_token：优先从 Auth0 SPA SDK 的 localStorage 缓存读取，
      // 兜底读 auth0_token cookie；拿到后 postMessage 回 JS 侧存入 Keystore
      injectedJavaScript: `(function() {
        try {
          var token = '';
          for (var i = 0; i < window.localStorage.length; i++) {
            var key = window.localStorage.key(i);
            if (key && key.indexOf('@@auth0spajs@@') === 0) {
              var parsed = null;
              try { parsed = JSON.parse(window.localStorage.getItem(key)); } catch (_) {}
              var candidate = parsed && parsed.body && parsed.body.access_token;
              if (typeof candidate === 'string' && candidate) { token = candidate; break; }
            }
          }
          if (!token) {
            var match = document.cookie.match(/(?:^|;\\s*)auth0_token=([^;]+)/);
            if (match) { token = decodeURIComponent(match[1]); }
          }
          if (token) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              hcomicToken: token,
              nonce: window.__MANGA_READER_NONCE__
            }));
          }
        } catch (_) {}
      })(); true;`,
    });
  }

  syncExtraData = (data: Record<string, unknown>) => {
    const token = data.hcomicToken;
    if (typeof token === 'string' && token.trim()) {
      this.authToken = token.trim();
      return '获取 HComic 登录凭据成功';
    }
    this.authToken = '';
  };

  /**
   * Auth0 Authorization Code + PKCE 账号密码登录（Auth0 客户端未开启 ROPG 密码授权，
   * 只能模拟浏览器走 PKCE 流程）。RN fetch 自动管理 Cookie 并跟随 GET 重定向：
   * GET /authorize 直接落在登录页；POST 登录表单的 302 不会被 OkHttp 跟随（POST 重定向
   * 仅 GET/HEAD 才跟随），可以从 Location 头继续；回调 GET 链自动跟到 h-comic.com，
   * 授权码出现在最终 response.url 上。
   */
  performLogin: NonNullable<Base['performLogin']> = async (username, password) => {
    const auth0Origin = `https://${AUTH0_DOMAIN}`;
    const loginHeaders = {
      'User-Agent': this.userAgent || '',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // 1. PKCE 参数。CryptoJS 的 WordArray.random 在 Hermes 下没有加密随机源会直接抛错，
    // 改用原生 SecureRandom 桥（输出 base64url，字符集本身就是合法的 PKCE verifier）
    const codeVerifier = SecureToken.createSessionNonce();
    const codeChallenge = toBase64Url(CryptoJS.SHA256(codeVerifier));
    const oauthState = SecureToken.createSessionNonce();

    // 2. GET /authorize（自动跟随重定向到登录页，同时建立 Auth0 会话 Cookie）
    const authorizeUrl = `${auth0Origin}/authorize?${queryString.stringify({
      response_type: 'code',
      client_id: AUTH0_CLIENT_ID,
      redirect_uri: AUTH0_REDIRECT_URI,
      audience: AUTH0_AUDIENCE,
      scope: AUTH0_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: oauthState,
    })}`;
    const loginPageResp = await fetch(authorizeUrl, { headers: loginHeaders });
    if (loginPageResp.status >= 400) {
      throw new Error(`Auth0 授权页请求失败（HTTP ${loginPageResp.status}）`);
    }
    const loginPageUrl = loginPageResp.url || authorizeUrl;
    const formState = extractFormState(await loginPageResp.text());
    if (!formState) {
      throw new Error('无法从 Auth0 登录页提取表单 state，请尝试使用 WebView 登录');
    }

    // 3. 单步登录：POST 用户名+密码到登录页 URL（Auth0 新版 Universal Login 单步表单）
    const loginResp = await fetch(loginPageUrl, {
      method: 'POST',
      headers: {
        ...loginHeaders,
        Origin: auth0Origin,
        Referer: loginPageUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: queryString.stringify({ state: formState, username, password, action: 'default' }),
    });

    // 4. 从回调重定向中捕获授权码
    let callbackUrl = '';
    const location = loginResp.headers.get('location') || '';
    if (location) {
      const absolute = location.startsWith('/') ? auth0Origin + location : location;
      // 重定向回 Auth0 登录页 = 登录被拒
      if (
        absolute.includes('auth0.com') &&
        (absolute.includes('/u/login') || absolute.includes('error='))
      ) {
        const errorCode = /[?&#]error=([^&]+)/.exec(absolute)?.[1];
        throw new Error(
          errorCode
            ? `登录失败：${decodeURIComponent(errorCode)}`
            : '登录失败：账号或密码错误'
        );
      }
      const callbackResp = await fetch(absolute, { headers: loginHeaders });
      callbackUrl = callbackResp.url || absolute;
    } else {
      if (loginResp.status >= 400) {
        throw new Error(`登录请求失败（HTTP ${loginResp.status}）`);
      }
      // 密码错误时 Auth0 返回 200 + 错误页；若整个重定向链被跟随，resp.url 上直接带 code
      callbackUrl = loginResp.url || '';
      if (!/[?&#]code=/.test(callbackUrl)) {
        const detail = extractAuth0Error(await loginResp.text());
        throw new Error(detail ? `登录失败：${detail}` : '登录失败：账号或密码错误');
      }
    }

    const authCode = /[?&#]code=([^&]+)/.exec(callbackUrl)?.[1];
    if (!authCode) {
      const errorCode = /[?&#]error=([^&]+)/.exec(callbackUrl)?.[1];
      throw new Error(
        errorCode
          ? `登录失败：${decodeURIComponent(errorCode)}`
          : '登录回调异常：未收到授权码，请尝试使用 WebView 登录'
      );
    }

    // 5. POST /oauth/token：授权码 + code_verifier 换 access_token
    const tokenResp = await fetch(`${auth0Origin}/oauth/token`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent || '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: AUTH0_CLIENT_ID,
        code: authCode,
        code_verifier: codeVerifier,
        redirect_uri: AUTH0_REDIRECT_URI,
      }),
    });
    const result: { access_token?: string; error?: string; error_description?: string } =
      await tokenResp.json().catch(() => ({}));
    if (tokenResp.status >= 400) {
      const detail = result.error_description || result.error || '';
      throw new Error(`Token 交换失败（HTTP ${tokenResp.status}）${detail ? `：${detail}` : ''}`);
    }
    if (!result.access_token) {
      throw new Error(result.error_description || result.error || ErrorMessage.MissingTokenHCOMIC);
    }
    return result.access_token;
  };

  private getMangaId(item: HComicItem): string {
    return String(item.id || item._id || '');
  }

  private getTitle(item: HComicItem): string {
    return (
      item.title?.display ||
      item.title?.japanese ||
      item.title?.pretty ||
      item.title?.english ||
      '未知标题'
    );
  }

  private getComicUrl(mangaId: string, reader = false): string {
    const id = mangaId.trim();
    if (!id) {
      throw new Error(`HComic ${ErrorMessage.MissingMangaInfo}`);
    }
    // 标题 slug 并不唯一，同名漫画会被站点路由到旧记录；数字 ID 可稳定定位唯一条目。
    const path = `https://h-comic.com/comics/${encodeURIComponent(id)}`;
    return `${path}${reader ? '/1' : ''}?id=${encodeURIComponent(id)}`;
  }

  private assertMangaId(item: HComicItem, mangaId: string): void {
    const responseId = this.getMangaId(item);
    if (!responseId || responseId !== mangaId) {
      throw new Error(`HComic ${ErrorMessage.WrongMangaData}`);
    }
  }

  private getImagePrefix(comicSource = ''): string {
    const suffixMap: Record<string, string> = {
      MMCG_SHORT: 'mms',
      MMCG_LONG: 'mml',
    };
    const suffix = suffixMap[comicSource.toUpperCase()] || 'nh';
    return `https://h-comic.link/api/${suffix}`;
  }

  private getCover(item: HComicItem): string {
    if (item.thumbnail) {
      return item.thumbnail;
    }
    return item.media_id
      ? `${this.getImagePrefix(item.comic_source)}/${String(item.media_id)}`
      : '';
  }

  private getAuthors(item: HComicItem): string[] {
    return (item.tags || [])
      .filter((tag) => tag.type === 'artist' && tag.name)
      .map((tag) => tag.name as string);
  }

  private getTags(item: HComicItem): string[] {
    return Array.from(
      new Set(
        (item.tags || [])
          .filter((tag) => !['artist', 'language'].includes(tag.type || ''))
          .map((tag) => tag.name_zh || tag.name || '')
          .filter(Boolean)
      )
    );
  }

  private toManga(item: HComicItem): IncreaseManga {
    const mangaId = this.getMangaId(item);
    return {
      href: this.getComicUrl(mangaId),
      hash: Base.combineHash(this.id, mangaId),
      source: this.id,
      sourceName: this.name,
      mangaId,
      bookCover: this.getCover(item),
      headers: this.defaultHeaders,
      title: this.getTitle(item),
      updateTime: item.upload_date
        ? dayjs.unix(Number(item.upload_date)).format('YYYY-MM-DD')
        : undefined,
      author: this.getAuthors(item),
      tag: this.getTags(item),
      status: MangaStatus.End,
    };
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page) => ({
    url: 'https://h-comic.com/',
    body: { q: '', page: page > 1 ? page : undefined },
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page) => ({
    url: 'https://h-comic.com/',
    body: { q: keyword, page: page > 1 ? page : undefined },
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) => ({
    url: this.getComicUrl(mangaId, true),
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  // 在线收藏夹：JSON API + Auth0 Bearer token（WebView 登录后由 syncExtraData 注入）
  prepareFavoritesFetch: NonNullable<Base['prepareFavoritesFetch']> = (page) => {
    if (!this.authToken) {
      throw new Error(ErrorMessage.MissingTokenHCOMIC);
    }
    return {
      url: 'https://api.h-comic.com/api/favourites',
      body: { page, limit: 20 },
      headers: new Headers({
        'User-Agent': this.defaultHeaders['User-Agent'],
        Accept: 'application/json',
        Authorization: `Bearer ${this.authToken}`,
        Origin: 'https://h-comic.com',
        Referer: 'https://h-comic.com/',
      }),
      timeout: 20000,
      authErrorMessage: ErrorMessage.AuthFailHCOMIC,
    };
  };

  prepareChapterFetch: Base['prepareChapterFetch'] = (
    mangaId,
    _chapterId,
    _page,
    _extra,
    _context
  ) => ({
    url: this.getComicUrl(mangaId, true),
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  handleDiscovery: Base['handleDiscovery'] = (text: string | null) => ({
    discovery: (extractPayload(text).comics || []).map((item) => this.toManga(item)),
  });

  handleSearch: Base['handleSearch'] = (text: string | null) => ({
    search: (extractPayload(text).comics || []).map((item) => this.toManga(item)),
  });

  handleFavorites: NonNullable<Base['handleFavorites']> = (response: {
    docs?: { comic?: HComicItem | null }[];
  }) => {
    if (!response || !Array.isArray(response.docs)) {
      throw new Error(`HComic ${ErrorMessage.WrongPageStructure}`);
    }
    return {
      favorites: response.docs
        .map((doc) => doc?.comic)
        .filter((comic): comic is HComicItem => Boolean(comic && this.getMangaId(comic)))
        .map((comic) => this.toManga(comic)),
    };
  };

  handleMangaInfo: Base['handleMangaInfo'] = (text: string | null, mangaId) => {
    const item = extractPayload(text).comic;
    if (!item) {
      throw new Error(`HComic ${ErrorMessage.MissingMangaInfo}`);
    }
    this.assertMangaId(item, mangaId);
    const chapterId = '1';
    return {
      manga: {
        ...this.toManga(item),
        infoCover: this.getCover(item),
        latest: '全一话',
        chapters: [
          {
            hash: Base.combineHash(this.id, mangaId, chapterId),
            mangaId,
            chapterId,
            href: this.getComicUrl(mangaId, true),
            title: '全一话',
          },
        ],
      },
    };
  };

  handleChapter: Base['handleChapter'] = (text: string | null, mangaId, chapterId) => {
    const item = extractPayload(text).comic;
    if (!item?.media_id) {
      throw new Error(`HComic ${ErrorMessage.MissingImageData}`);
    }
    this.assertMangaId(item, mangaId);
    const imagePrefix = `${this.getImagePrefix(item.comic_source)}/${String(item.media_id)}/pages`;
    const pageCount = Math.max(0, Number(item.num_pages || item.images?.pages?.length || 0));
    return {
      canLoadMore: false,
      chapter: {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        name: this.getTitle(item),
        title: '全一话',
        headers: this.defaultHeaders,
        images: Array.from({ length: pageCount }, (_, index) => ({
          uri: `${imagePrefix}/${index + 1}`,
        })),
      },
    };
  };
}

export default new HComic();
