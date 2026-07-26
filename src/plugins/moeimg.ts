import Base, { Plugin } from './base';
import { MangaStatus, ErrorMessage } from '~/utils';
import dayjs from 'dayjs';

interface MoeImgListItem {
  manga_id?: string | number;
  manga_name?: string;
  manga_cover_img?: string;
  language?: string;
}

interface MoeImgListResponse {
  manga_list?: MoeImgListItem[];
  pagi?: {
    cur_page?: number;
    pages?: unknown[];
  };
}

interface MoeImgNameItem {
  tag_name?: string;
  author_name?: string;
  name?: string;
}

interface MoeImgChapterItem {
  chapter_id?: string | number;
  chapter_title?: string;
  chapter_number?: number;
  chapter_date_published?: string;
}

interface MoeImgDetailResponse {
  detail?: {
    manga_id?: string | number;
    manga_name?: string;
    ja_manga_name?: string;
    manga_status?: string;
    manga_date_published?: string;
    manga_updated?: string;
    manga_cover_img?: string;
    manga_cover_img_full?: string;
    language?: string;
    category?: string;
    tags?: MoeImgNameItem[];
    authors?: MoeImgNameItem[];
  };
  tags?: MoeImgNameItem[];
  authors?: MoeImgNameItem[];
  chapters?: MoeImgChapterItem[];
}

interface MoeImgReadResponse {
  chapter_detail?: {
    manga_name?: string;
    chapter_id?: string | number;
    chapter_title?: string;
    chapter_content?: string;
    server?: string;
    slaves?: string[];
    total?: number;
  };
}

function uniqueNames(items: unknown, key: 'tag_name' | 'author_name'): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return Array.from(
    new Set(
      items
        .map((item) => {
          if (typeof item === 'string') {
            return item.trim();
          }
          if (!item || typeof item !== 'object') {
            return '';
          }
          const value = item as MoeImgNameItem;
          return String(value[key] || value.name || value.tag_name || '').trim();
        })
        .filter(Boolean)
    )
  );
}

function joinImageUrl(server: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${server.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

class MoeImg extends Base {
  private readonly imageHeaders: Record<string, string>;

  constructor() {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    super({
      score: 5,
      id: Plugin.MOEIMG,
      name: 'MoeImg',
      shortName: 'MoeImg',
      description: '无需登录即可浏览和阅读，收藏功能需登录网站',
      href: 'https://moeimg.fan/',
      userAgent,
      defaultHeaders: {
        'User-Agent': userAgent,
        Accept: 'application/json,text/html,*/*',
        Referer: 'https://moeimg.fan/',
      },
      option: {
        discovery: [],
        search: [
          {
            name: 'language',
            options: [
              { label: '全部语言', value: '' },
              { label: '中文', value: 'chinese' },
            ],
          },
        ],
      },
    });
    this.imageHeaders = {
      'User-Agent': userAgent,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://moeimg.fan/',
    };
  }

  private listItemToManga(item: MoeImgListItem): IncreaseManga {
    const mangaId = String(item.manga_id || '');
    return {
      href: `https://moeimg.fan/post/fa${mangaId}`,
      hash: Base.combineHash(this.id, mangaId),
      source: this.id,
      sourceName: this.name,
      mangaId,
      bookCover: item.manga_cover_img || '',
      headers: this.imageHeaders,
      title: item.manga_name?.trim() || '未知标题',
      tag: item.language ? [item.language] : [],
      status: MangaStatus.End,
    };
  }

  private prepareListFetch(path: string, body: Record<string, unknown>): FetchData {
    return {
      url: `https://moeimg.fan${path}`,
      body,
      headers: new Headers(this.defaultHeaders),
      timeout: 20000,
    };
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page) =>
    this.prepareListFetch('/spa/latest-manga', { page });

  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page, { language }) => {
    if (!keyword && language === 'chinese') {
      return this.prepareListFetch('/spa/language/chinese', { page });
    }
    if (!keyword) {
      return this.prepareListFetch('/spa/latest-manga', { page });
    }
    return this.prepareListFetch('/spa/search', { query: keyword, page });
  };

  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) => ({
    url: `https://moeimg.fan/spa/manga/${mangaId}`,
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });


  prepareChapterFetch: Base['prepareChapterFetch'] = (mangaId) => ({
    url: `https://moeimg.fan/spa/manga/${mangaId}/read`,
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  handleDiscovery: Base['handleDiscovery'] = (response: MoeImgListResponse) => ({
    discovery: (response.manga_list || []).map((item) => this.listItemToManga(item)),
  });

  handleSearch: Base['handleSearch'] = (response: MoeImgListResponse) => ({
    search: (response.manga_list || []).map((item) => this.listItemToManga(item)),
  });

  handleMangaInfo: Base['handleMangaInfo'] = (response: MoeImgDetailResponse, mangaId) => {
    const detail = response.detail;
    if (!detail) {
      throw new Error(`${this.name} ${ErrorMessage.MissingMangaInfo}`);
    }
    const chapters = response.chapters || [];
    const chapter = chapters[0];
    const chapterId = String(chapter?.chapter_id || mangaId);
    const chapterTitle = chapter?.chapter_title?.trim() || '全一话';
    const tags = Array.from(
      new Set([
        ...uniqueNames(response.tags, 'tag_name'),
        ...uniqueNames(detail.tags, 'tag_name'),
        ...(detail.category ? [detail.category] : []),
        ...(detail.language ? [detail.language] : []),
      ])
    );
    const authors = uniqueNames(response.authors || detail.authors, 'author_name');
    const title = detail.manga_name?.trim() || detail.ja_manga_name?.trim() || '未知标题';
    const updateTime = detail.manga_updated || detail.manga_date_published;

    return {
      manga: {
        href: `https://moeimg.fan/post/fa${mangaId}`,
        hash: Base.combineHash(this.id, mangaId),
        source: this.id,
        sourceName: this.name,
        mangaId,
        infoCover: detail.manga_cover_img || detail.manga_cover_img_full || '',
        headers: this.imageHeaders,
        title,
        latest: chapterTitle,
        updateTime:
          updateTime && dayjs(updateTime).isValid()
            ? dayjs(updateTime).format('YYYY-MM-DD')
            : undefined,
        author: authors,
        tag: tags,
        status: MangaStatus.End,
        chapters: [
          {
            hash: Base.combineHash(this.id, mangaId, chapterId),
            mangaId,
            chapterId,
            href: `https://moeimg.fan/post/fa${mangaId}`,
            title: chapterTitle,
          },
        ],
      },
    };
  };

  handleChapter: Base['handleChapter'] = (response: MoeImgReadResponse, mangaId, chapterId) => {
    const detail = response.chapter_detail;
    if (!detail) {
      throw new Error(ErrorMessage.MissingChapterInfo);
    }
    if (detail.chapter_id && String(detail.chapter_id) !== chapterId) {
      throw new Error(ErrorMessage.WrongChapterData);
    }
    const server = detail.server || (detail.slaves || []).find(Boolean) || '';
    const content = detail.chapter_content || '';
    const imagePaths = Array.from(
      content.matchAll(/(?:data-url|data-src|src)=["']([^"']+)["']/g),
      (match) => match[1]
    );
    const images = Array.from(
      new Set(
        imagePaths
          .filter((path) => path && !/^(data:|javascript:)/i.test(path))
          .map((path) => joinImageUrl(server, path))
      )
    );
    if (images.length === 0) {
      throw new Error(ErrorMessage.MissingImageData);
    }
    return {
      canLoadMore: false,
      chapter: {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        name: detail.manga_name,
        title: detail.chapter_title?.trim() || '全一话',
        headers: this.imageHeaders,
        images: images.map((uri) => ({ uri })),
      },
    };
  };
}

export default new MoeImg();
