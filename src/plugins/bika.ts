import Base, { Options, Plugin } from './base';
import { ErrorMessage, MangaStatus } from '~/utils';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import queryString from 'query-string';

interface BikaImage {
  fileServer?: string;
  path?: string;
}

interface BikaComicItem {
  _id?: string;
  id?: string;
  title?: string;
  author?: string;
  categories?: string[];
  tags?: string[];
  epsCount?: number;
  finished?: boolean;
  thumb?: BikaImage;
  updated_at?: string;
}

interface BikaListResponse {
  code: number;
  message?: string;
  data?: {
    comics?:
      | BikaComicItem[]
      | {
          docs?: BikaComicItem[];
          page?: number;
          pages?: number;
          total?: number;
          limit?: number;
        };
  };
}

interface BikaDetailResponse {
  code: number;
  message?: string;
  data?: { comic?: BikaComicItem };
}

interface BikaChapterListResponse {
  code: number;
  message?: string;
  data?: {
    eps?: {
      docs?: { order?: number; title?: string }[];
      page?: number;
      pages?: number;
      total?: number;
      limit?: number;
    };
  };
}

interface BikaChapterResponse {
  code: number;
  message?: string;
  data?: {
    ep?: { title?: string };
    pages?: {
      docs?: { media?: BikaImage }[];
      page?: number;
      pages?: number;
      total?: number;
      limit?: number;
    };
  };
}

interface BikaLoginResponse {
  code: number;
  message?: string;
  data?: { token?: string };
}

const API_BASE_URL = 'https://picaapi.picacomic.com/';
const API_KEY = 'C69BAF41DA5ABD1FFEDC6D2FEA56B';
const SECRET_KEY = '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn';
const NONCE = '4ce7a7aa759b40f794d189a88b84aba8';
const IMAGE_DEFAULT = 'https://storage1.picacomic.com';
const IMAGE_TO_BE_IMG = 'https://img.picacomic.com';
const IMAGE_TO_BS = 'https://storage-b.picacomic.com';

const sortOptions = [
  { label: '新到旧', value: Options.Default },
  { label: '旧到新', value: 'da' },
  { label: '最多爱心', value: 'ld' },
  { label: '最多观看', value: 'vd' },
];

class Bika extends Base {
  constructor() {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    super({
      score: 5,
      id: Plugin.BIKA,
      name: '哔咔漫画',
      shortName: 'Bika',
      description: '需要代理和登录，可点右侧图标用账号密码登录，或点来源链接在 WebView 获取 Token',
      href: 'https://manhuabika.com/plogin/',
      userAgent,
      defaultHeaders: {
        accept: 'application/vnd.picacomic.com.v1+json',
        'User-Agent': 'okhttp/3.8.1',
        'Content-Type': 'application/json; charset=UTF-8',
        'api-key': API_KEY,
        'app-build-version': '45',
        'app-platform': 'android',
        'app-uuid': 'defaultUuid',
        'app-version': '2.2.1.3.3.4',
        nonce: NONCE,
        'app-channel': '1',
        'image-quality': 'original',
        authorization: '',
      },
      injectedJavaScript: `(function() {
        try {
          var stored = window.localStorage.getItem('token');
          var parsed = stored ? JSON.parse(stored) : null;
          var token = typeof parsed === 'string' ? parsed : parsed && parsed.value;
          if (token) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              bikaToken: token,
              nonce: window.__MANGA_READER_NONCE__
            }));
          }
        } catch (_) {}
      })(); true;`,
      option: {
        discovery: [{ name: 'sort', options: sortOptions }],
        search: [{ name: 'sort', options: sortOptions }],
      },
      batchDelay: 2000,
    });
  }

  syncExtraData = (data: Record<string, unknown>) => {
    const token = data.bikaToken || data.picaToken;
    if (typeof token === 'string' && token.trim()) {
      this.defaultHeaders.authorization = token.trim();
      return '获取 Bika Token 成功';
    }
    this.defaultHeaders.authorization = '';
  };

  private signature(path: string, timestamp: string, method: 'GET' | 'POST'): string {
    const raw = (path + timestamp + NONCE + method + API_KEY).toLowerCase();
    return CryptoJS.HmacSHA256(raw, SECRET_KEY).toString(CryptoJS.enc.Hex);
  }

  private getHeaders(path: string, method: 'GET' | 'POST'): Headers {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return new Headers({
      ...this.defaultHeaders,
      time: timestamp,
      signature: this.signature(path, timestamp, method),
    });
  }

  private getRequest(path: string, body: Record<string, unknown> = {}): FetchData {
    const query = queryString.stringify(body);
    const signedPath = query ? `${path}?${query}` : path;
    return {
      url: API_BASE_URL + path,
      body,
      headers: this.getHeaders(signedPath, 'GET'),
      timeout: 20000,
      authErrorMessage: ErrorMessage.AuthFailBIKA,
    };
  }

  private responseError(code: number, message = ''): Error {
    if (code === 401 || code === 403) {
      return new Error(ErrorMessage.AuthFailBIKA);
    }
    return new Error(ErrorMessage.WrongResponse + (message || code));
  }

  private decodeImageToBeImgPath(path: string): string {
    if (!path.startsWith('tobeimg/')) {
      return path;
    }
    const filename = path.substring(path.lastIndexOf('/') + 1);
    const encoded = filename.substring(0, filename.lastIndexOf('.'));
    return Buffer.from(encoded, 'base64').toString('utf-8');
  }

  private imageUrl(image: BikaImage = {}): string {
    let fileServer = image.fileServer || '';
    let path = image.path || '';
    if (!path) {
      return '';
    }
    if (path.startsWith('tobeimg/')) {
      if (fileServer === IMAGE_DEFAULT || fileServer === IMAGE_TO_BS) {
        return this.decodeImageToBeImgPath(path);
      }
      fileServer ||= IMAGE_TO_BE_IMG;
      path = '/' + path.substring(8);
    } else if (path.startsWith('tobs/')) {
      fileServer ||= IMAGE_TO_BS;
      path = '/static/' + path.substring(5);
    } else {
      fileServer ||= IMAGE_DEFAULT;
      path = '/static/' + path.replace(/^\/+/, '');
    }
    return fileServer.replace(/\/+$/, '') + path;
  }

  private toManga(item: BikaComicItem): IncreaseManga {
    const mangaId = item._id || item.id || '';
    return {
      href: `https://manhuabika.com/pcomicview/?cid=${mangaId}`,
      hash: Base.combineHash(this.id, mangaId),
      source: this.id,
      sourceName: this.name,
      mangaId,
      bookCover: this.imageUrl(item.thumb),
      title: item.title || '未知标题',
      updateTime: item.updated_at ? dayjs(item.updated_at).format('YYYY-MM-DD') : undefined,
      author: item.author ? item.author.split(',').map((value) => value.trim()) : [],
      tag: Array.from(new Set([...(item.categories || []), ...(item.tags || [])])),
      status: item.finished ? MangaStatus.End : MangaStatus.Serial,
    };
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page, { sort }) =>
    this.getRequest('comics', { page, s: sort === Options.Default ? 'dd' : sort });

  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page, { sort }) => {
    const path = `comics/advanced-search?page=${page}`;
    return {
      url: API_BASE_URL + path,
      method: 'POST',
      body: { keyword, sort: sort === Options.Default ? 'dd' : sort },
      headers: this.getHeaders(path, 'POST'),
      timeout: 20000,
      authErrorMessage: ErrorMessage.AuthFailBIKA,
    };
  };

  prepareLoginFetch: NonNullable<Base['prepareLoginFetch']> = (username, password) => {
    const path = 'auth/sign-in';
    return {
      url: API_BASE_URL + path,
      method: 'POST',
      // API 的 email 字段实际传账户名（哔咔账号并非邮箱）
      body: { email: username, password },
      headers: this.getHeaders(path, 'POST'),
      timeout: 20000,
    };
  };

  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) =>
    this.getRequest(`comics/${mangaId}`);

  prepareChapterListFetch: Base['prepareChapterListFetch'] = (mangaId, page) =>
    this.getRequest(`comics/${mangaId}/eps`, { page });

  prepareChapterFetch: Base['prepareChapterFetch'] = (mangaId, chapterId, page) =>
    this.getRequest(`comics/${mangaId}/order/${chapterId}/pages`, { page });

  handleLogin: NonNullable<Base['handleLogin']> = (response: BikaLoginResponse) => {
    if (response.code !== 200) {
      const message =
        response.code === 401 || response.code === 403
          ? ErrorMessage.LoginFailBIKA
          : ErrorMessage.WrongResponse + (response.message || response.code);
      return { error: new Error(message) };
    }
    const token = response.data?.token?.trim();
    if (!token) {
      return { error: new Error('哔咔登录响应缺少 Token') };
    }
    return { token };
  };

  handleDiscovery: Base['handleDiscovery'] = (response: BikaListResponse) => {
    if (response.code !== 200) {
      return { error: this.responseError(response.code, response.message) };
    }
    const comics = response.data?.comics;
    const docs = Array.isArray(comics) ? comics : comics?.docs || [];
    return { discovery: docs.map((item) => this.toManga(item)) };
  };

  handleSearch: Base['handleSearch'] = (response: BikaListResponse) => {
    if (response.code !== 200) {
      return { error: this.responseError(response.code, response.message) };
    }
    const comics = response.data?.comics;
    const docs = Array.isArray(comics) ? comics : comics?.docs || [];
    return { search: docs.map((item) => this.toManga(item)) };
  };

  handleMangaInfo: Base['handleMangaInfo'] = (response: BikaDetailResponse, mangaId) => {
    if (response.code !== 200) {
      return { error: this.responseError(response.code, response.message) };
    }
    const comic = response.data?.comic;
    if (!comic) {
      throw new Error('Bika 详情数据缺失');
    }
    const item = this.toManga({ ...comic, _id: mangaId });
    return {
      manga: {
        ...item,
        infoCover: this.imageUrl(comic.thumb),
      },
    };
  };

  handleChapterList: Base['handleChapterList'] = (response: BikaChapterListResponse, mangaId) => {
    if (response.code !== 200) {
      return { error: this.responseError(response.code, response.message) };
    }
    const eps = response.data?.eps;
    if (!eps) {
      throw new Error('Bika 章节数据缺失');
    }
    const seen = new Set<number>();
    return {
      canLoadMore: Number(eps.page || 1) < Number(eps.pages || 1),
      chapterList: (eps.docs || [])
        .filter((item) => {
          const order = Number(item.order || 0);
          if (!order || seen.has(order)) {
            return false;
          }
          seen.add(order);
          return true;
        })
        .map((item) => {
          const chapterId = String(item.order);
          return {
            hash: Base.combineHash(this.id, mangaId, chapterId),
            mangaId,
            chapterId,
            href: `https://manhuabika.com/pchapter/?cid=${mangaId}&chapter=${chapterId}`,
            title: item.title || `第 ${chapterId} 话`,
          };
        }),
    };
  };

  handleChapter: Base['handleChapter'] = (response: BikaChapterResponse, mangaId, chapterId) => {
    if (response.code !== 200) {
      return { error: this.responseError(response.code, response.message) };
    }
    const pages = response.data?.pages;
    if (!pages) {
      throw new Error('Bika 图片数据缺失');
    }
    return {
      canLoadMore: Number(pages.page || 1) < Number(pages.pages || 1),
      chapter: {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        title: response.data?.ep?.title || `第 ${chapterId} 话`,
        images: (pages.docs || [])
          .map((item) => this.imageUrl(item.media))
          .filter(Boolean)
          .map((uri) => ({ uri })),
      },
    };
  };
}

export default new Bika();
