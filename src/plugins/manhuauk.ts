import Base, { Plugin, Options } from './base';
import { MangaStatus, ErrorMessage } from '~/utils';
import { decodeTurboStream } from '~/utils/turboStream';

/**
 * manhua.uk 漫画源。
 *
 * 站点为 React Router v7 SSR：页面 URL 加 `.data` 后缀返回 turbo-stream 编码
 * JSON（解码见 `src/utils/turboStream.ts`），而非 HTML。本插件匿名即可浏览
 * 与阅读；登录 / 在线收藏未实现（站点另有 JWT + like/favorites 两套接口）。
 *
 * 关键差异（相对其它源）：
 * - 列表 / 详情走 turbo-stream：`GET /zh-CN/comics[/<id>].data`，需带浏览器
 *   UA 与 `Accept: text/x-turbo-stream`（否则 Cloudflare 403）。
 * - 纯游标分页：`next` 参数 = 上一页末条的 `paginationToken`（无筛选列表
 *   如「最近更新」记录不含该字段，游标退化为末条 `_id`）。每页 11 条。
 * - 无章节概念：一本漫画即一组图片，映射为单章节「全一话」（chapterId =
 *   mangaId），阅读与详情同 URL。
 * - 图片直链 `https://manhua.uk/image` + 路径，无 UA / Referer / 签名校验。
 */

const BASE_URL = 'https://manhua.uk';
const IMAGE_PREFIX = `${BASE_URL}/image`;
const DATA_PREFIX = `${BASE_URL}/zh-CN`;

// 站点要求浏览器 UA（Cloudflare）；Accept 必须含 turbo-stream 才返回数据端点
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

/** turbo-stream 解码后，列表 data 分支里单条漫画的字段。 */
interface UkComicListItem {
  _id?: string;
  title?: string;
  cover_image?: string;
  images_size?: number;
  classification?: string;
  language?: string;
  tags?: unknown;
  paginationToken?: string;
}

/** 详情 data 分支里 comics 对象的字段。 */
interface UkComicDetail extends UkComicListItem {
  images?: unknown;
}

class ManHuaUk extends Base {
  /**
   * 游标分页缓存：signature → 链尾游标（最近一次请求返回的末条 token）。
   *
   * MangaReader 的 saga 是无状态页码模型（`prepareDiscoveryFetch(page)` 为
   * 纯函数，不持有上下文），而站点是游标分页（`next` = 上一页末条 token）。
   * 借助插件全局单例在此缓存链尾游标：prepare 阶段读链尾填入 `next`，handle
   * 阶段解析后写入新链尾。signature 隔离不同筛选 / 关键词，避免互相污染。
   *
   * saga 用 takeLatestSuspense 串行驱动，page 单调递增，链尾语义正确；切筛选
   * 时 UI 会 reset（page=1），新 signature 从空链开始。
   */
  private cursorCache: Record<string, string> = {};
  /**
   * 待回填的 signature：prepare 阶段写入，handle 阶段读出并清空。同一插件的
   * discovery / search 共用此字段——因 saga 串行、且 prepare 与 handle 紧邻
   * 配对执行，不会跨请求串台。
   */
  private pendingSignature: string | null = null;

  constructor() {
    super({
      score: 5,
      id: Plugin.MANHUAUK,
      name: 'manhua.uk',
      shortName: 'manhua.uk',
      description: '无需登录即可浏览和阅读',
      href: `${BASE_URL}/`,
      userAgent: USER_AGENT,
      defaultHeaders: {
        'User-Agent': USER_AGENT,
        Accept: 'text/x-turbo-stream, application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
        Referer: `${BASE_URL}/`,
      },
      // 语言筛选用「只看中文」开关控制（setting.chineseOnly，由 saga 注入 language=zh），
      // 不在搜索栏暴露下拉，避免两个语言控制并存冲突
      option: { discovery: [], search: [] },
    });
  }

  // ------------------------------------------------------------------
  // 请求构造
  // ------------------------------------------------------------------

  /**
   * discovery 的游标 signature。仅依赖筛选（discovery 不带关键词）。
   * 用 JSON.stringify 而非 queryString：keys 顺序无关、值含特殊字符也安全。
   */
  private discoverySignature(filter: Record<string, string>): string {
    return `discovery:${JSON.stringify(filter || {})}`;
  }

  /** search 的游标 signature：关键词 + 筛选。 */
  private searchSignature(keyword: string, filter: Record<string, string>): string {
    return `search:${keyword || ''}:${JSON.stringify(filter || {})}`;
  }

  /**
   * 构建 discovery / search 的查询 body（不含游标）。
   *
   * saga 会把筛选项的 defaultValue（`Options.Default = '$$DEFAULT$$'`）填入 filter
   * 表示「该筛选不生效」，必须过滤掉，否则会把 `language=$$DEFAULT$$` 发给站点导致 404。
   */
  private buildListBody(filter: Record<string, string>, keyword?: string): Record<string, any> {
    const body: Record<string, any> = {};
    const keywordTrim = (keyword || '').trim();
    if (keywordTrim) {
      body.q = keywordTrim;
    }
    const language = (filter.language || '').trim();
    if (language && language !== Options.Default) {
      body.language = language;
    }
    return body;
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page, filter) => {
    const signature = this.discoverySignature(filter);
    const body = this.buildListBody(filter);
    if (page > 1) {
      const next = this.cursorCache[signature] || '';
      if (next) {
        body.next = next;
      }
    }
    // 记录待回填 signature，handleDiscovery 时写入链尾游标
    this.pendingSignature = signature;
    return {
      url: `${DATA_PREFIX}/comics.data`,
      body,
      headers: new Headers(this.defaultHeaders),
    };
  };

  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page, filter) => {
    const signature = this.searchSignature(keyword, filter);
    const body = this.buildListBody(filter, keyword);
    if (page > 1) {
      const next = this.cursorCache[signature] || '';
      if (next) {
        body.next = next;
      }
    }
    this.pendingSignature = signature;
    return {
      url: `${DATA_PREFIX}/comics.data`,
      body,
      headers: new Headers(this.defaultHeaders),
    };
  };

  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) => ({
    url: `${DATA_PREFIX}/comics/${mangaId}.data`,
    headers: new Headers(this.defaultHeaders),
  });

  // 详情与阅读同 URL：单章节，详情页 comics.images 即全部图片
  prepareChapterFetch: Base['prepareChapterFetch'] = (mangaId) => ({
    url: `${DATA_PREFIX}/comics/${mangaId}.data`,
    headers: new Headers(this.defaultHeaders),
  });

  // ------------------------------------------------------------------
  // 响应解析
  // ------------------------------------------------------------------

  handleDiscovery: Base['handleDiscovery'] = (response) => {
    const data = this.extractDataBranch(response);
    const items = extractComicList(data);
    // 回填链尾游标，供下一页 prepare 使用
    this.recordCursor(items);
    return { discovery: items.map((item) => this.listItemToManga(item)) };
  };

  handleSearch: Base['handleSearch'] = (response) => {
    const data = this.extractDataBranch(response);
    const items = extractComicList(data);
    this.recordCursor(items);
    return { search: items.map((item) => this.listItemToManga(item)) };
  };

  handleMangaInfo: Base['handleMangaInfo'] = (response, mangaId) => {
    const data = this.extractDataBranch(response);
    const comic = data?.comics;
    if (!comic || typeof comic !== 'object') {
      throw new Error(`${this.name} ${ErrorMessage.MissingMangaInfo}`);
    }
    const detail = comic as UkComicDetail;
    const id = String(detail._id || mangaId);
    const tags = extractTags(detail.tags);
    const classification = mapClassification(detail.classification);
    if (classification) {
      tags.push(classification);
    }

    return {
      manga: {
        href: `${DATA_PREFIX}/comics/${id}`,
        hash: Base.combineHash(this.id, id),
        source: this.id,
        sourceName: this.name,
        mangaId: id,
        infoCover: buildImageUrl(detail.cover_image),
        title: String(detail.title || '').trim() || '未知标题',
        tag: Array.from(new Set(tags.filter(Boolean))),
        status: MangaStatus.End,
        chapters: [
          {
            // chapterId = mangaId：一本漫画即一章，避免 splitHash 出现空段
            hash: Base.combineHash(this.id, id, id),
            mangaId: id,
            chapterId: id,
            href: `${DATA_PREFIX}/comics/${id}`,
            title: '全一话',
          },
        ],
      },
    };
  };

  handleChapter: Base['handleChapter'] = (response, mangaId, chapterId) => {
    const data = this.extractDataBranch(response);
    const comic = data?.comics;
    if (!comic || typeof comic !== 'object') {
      throw new Error(ErrorMessage.MissingChapterInfo);
    }
    const detail = comic as UkComicDetail;
    const images = extractImages(detail.images);
    if (images.length === 0) {
      throw new Error(ErrorMessage.MissingImageData);
    }
    return {
      canLoadMore: false,
      chapter: {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        name: String(detail.title || '').trim() || undefined,
        title: '全一话',
        images: images.map((uri) => ({ uri })),
      },
    };
  };

  // ------------------------------------------------------------------
  // turbo-stream 提取辅助
  // ------------------------------------------------------------------

  /**
   * 解码 turbo-stream 并提取叶子路由的 data 分支。
   *
   * 根字典结构：`{ root: {...}, 'routes/comics-layout': { data: {...} },
   * 'routes/comics-index': { data: {...} }, ... }`。React Router 嵌套布局会
   * 产生多个含 `data` 的路由（layout + leaf）。叶子路由（如 comics-index /
   * comic-detail）的 data 含业务字段（comicses / comics）；layout 分支仅含
   * queriedAt 等元信息。优先返回 data 含业务键的分支，否则回退最后一个。
   */
  private extractDataBranch(response: any): Record<string, any> {
    let decoded: any;
    try {
      decoded = decodeTurboStream(response);
    } catch (e) {
      throw new Error(`${this.name} ${ErrorMessage.WrongResponse}${(e as Error).message}`);
    }
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return {};
    }
    let fallback: Record<string, any> = {};
    for (const [key, value] of Object.entries(decoded as Record<string, any>)) {
      if (!key.startsWith('routes/')) {
        continue;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const data = (value as { data?: any }).data;
      // 注意 typeof null === 'object'，须显式排除 null（layout 分支的 data 可能为 null）
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        continue;
      }
      if ('comicses' in data || 'comics' in data) {
        return data as Record<string, any>;
      }
      fallback = data as Record<string, any>;
    }
    return fallback;
  }

  /** 解析列表末条的翻页游标并回填 cache。 */
  private recordCursor(items: UkComicListItem[]): void {
    const signature = this.pendingSignature;
    this.pendingSignature = null;
    if (!signature) {
      return;
    }
    this.cursorCache[signature] = lastPaginationToken(items);
  }

  private listItemToManga(item: UkComicListItem): IncreaseManga {
    const mangaId = String(item._id || '');
    const tags = extractTags(item.tags);
    const classification = mapClassification(item.classification);
    if (classification) {
      tags.push(classification);
    }
    return {
      href: `${DATA_PREFIX}/comics/${mangaId}`,
      hash: Base.combineHash(this.id, mangaId),
      source: this.id,
      sourceName: this.name,
      mangaId,
      bookCover: buildImageUrl(item.cover_image),
      title: String(item.title || '').trim() || '未知标题',
      tag: Array.from(new Set(tags.filter(Boolean))),
      status: MangaStatus.End,
    };
  }
}

// --------------------------------------------------------------------
// 纯函数辅助（不依赖 this，便于单测）
// --------------------------------------------------------------------

/** 拼接图片 / 封面直链：`https://manhua.uk/image` + 路径。 */
function buildImageUrl(path: unknown): string {
  if (typeof path !== 'string' || !path) {
    return '';
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${IMAGE_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** 从 turbo-stream 解码后的 data 字典提取漫画列表条目。 */
function extractComicList(data: any): UkComicListItem[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  const items = (data as { comicses?: unknown }).comicses;
  return Array.isArray(items) ? (items.filter(isPlainObject) as UkComicListItem[]) : [];
}

/** 取列表末条的翻页游标：优先 paginationToken，缺失时回退末条 `_id`。 */
function lastPaginationToken(items: UkComicListItem[]): string {
  if (items.length === 0) {
    return '';
  }
  const last = items[items.length - 1];
  const token = String(last.paginationToken || '').trim();
  if (token) {
    return token;
  }
  return String(last._id || '').trim();
}

/** 从 images 字段（字符串数组）提取图片 URL 列表，顺序敏感。 */
function extractImages(images: unknown): string[] {
  if (!Array.isArray(images)) {
    return [];
  }
  const urls: string[] = [];
  for (const path of images) {
    if (typeof path === 'string' && path) {
      urls.push(buildImageUrl(path));
    }
  }
  return urls;
}

/** 从 tags 字段（字符串数组或 {name} 对象数组）提取标签名。 */
function extractTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) {
        tags.push(trimmed);
      }
    } else if (isPlainObject(item)) {
      const name = String((item as { name?: unknown }).name || '').trim();
      if (name) {
        tags.push(name);
      }
    }
  }
  return tags;
}

/** 分类 key → 中文标签；非已知 key 原样透传。 */
function mapClassification(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const key = value.trim();
  if (!key) {
    return '';
  }
  const CLASSIFICATIONS: Record<string, string> = {
    booklet: '单行本',
    fanfiction: '同人',
    novelette: '杂志/短篇',
    korean_comics: '韩漫',
    '3D_comics': '3D漫画',
    photo_cosplay: 'Cosplay/写真',
  };
  return CLASSIFICATIONS[key] || key;
}

/** 是否为普通对象（非数组、非 null）。 */
function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype || value.constructor === Object;
}

// 暴露给单测（非插件公开 API）
export const __test__ = {
  buildImageUrl,
  extractImages,
  extractTags,
  mapClassification,
  lastPaginationToken,
  extractComicList,
};

export default new ManHuaUk();
