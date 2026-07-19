import Base, { Options, Plugin } from './base';
import { ErrorMessage, MangaStatus } from '~/utils';
import dayjs from 'dayjs';

interface NhTag {
  type?: string;
  name?: string;
}

interface NhListItem {
  id?: string | number;
  media_id?: string | number;
  english_title?: string;
  japanese_title?: string;
  thumbnail?: string;
  num_pages?: number;
  tags?: NhTag[] | null;
}

interface NhListResponse {
  result?: NhListItem[];
  num_pages?: number;
  total_pages?: number;
}

interface NhDetailResponse {
  id?: string | number;
  media_id?: string | number;
  title?: {
    english?: string;
    japanese?: string;
    pretty?: string;
  };
  thumbnail?: { path?: string };
  cover?: { path?: string };
  upload_date?: number;
  tags?: NhTag[];
  num_pages?: number;
  pages?: { number?: number; path?: string }[];
}

const sortOptions = [
  { label: '最近更新', value: Options.Default },
  { label: '今日热门', value: 'popular-today' },
  { label: '本周热门', value: 'popular-week' },
  { label: '本月热门', value: 'popular-month' },
  { label: '全部热门', value: 'popular' },
];

const languageOptions = [
  { label: '全部语言', value: Options.Default },
  { label: '中文', value: 'chinese' },
];

class NHentai extends Base {
  constructor() {
    const userAgent = 'Mozilla/5.0 (Linux; Android 13; rv:120.0) Gecko/120.0 Firefox/120.0';
    super({
      score: 5,
      id: Plugin.NH,
      name: 'nhentai',
      shortName: 'NH',
      description: '需要代理，支持按热度和中文筛选',
      href: 'https://nhentai.net/',
      userAgent,
      defaultHeaders: {
        'User-Agent': userAgent,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://nhentai.net/',
      },
      option: {
        discovery: [
          { name: 'sort', options: sortOptions },
          { name: 'language', options: languageOptions },
        ],
        search: [
          { name: 'sort', options: sortOptions },
          { name: 'language', options: languageOptions },
        ],
      },
    });
  }

  private buildThumbnail(path = ''): string {
    if (!path) {
      return '';
    }
    return `https://t.nhentai.net/${path.endsWith('.') ? path + 'jpg' : path}`;
  }

  private buildImage(path = ''): string {
    if (!path.startsWith('galleries/')) {
      return '';
    }
    return `https://i.nhentai.net/${path}`;
  }

  private listItemToManga(item: NhListItem): IncreaseManga {
    const mangaId = String(item.id || '');
    const tags = item.tags || [];
    return {
      href: `https://nhentai.net/g/${mangaId}/`,
      hash: Base.combineHash(this.id, mangaId),
      source: this.id,
      sourceName: this.name,
      mangaId,
      bookCover: this.buildThumbnail(item.thumbnail),
      headers: this.defaultHeaders,
      title: item.japanese_title || item.english_title || '未知标题',
      author: tags
        .filter((tag) => tag.type === 'artist' && tag.name)
        .map((tag) => tag.name as string),
      tag: tags
        .filter((tag) => tag.type !== 'language' && tag.name)
        .map((tag) => tag.name as string),
      status: MangaStatus.End,
    };
  }

  private prepareListing(
    page: number,
    keyword: string,
    sort: string = Options.Default,
    language: string = Options.Default
  ): FetchData {
    const chineseOnly = language === 'chinese';
    const query = chineseOnly
      ? [keyword.trim(), 'language:"chinese"'].filter(Boolean).join(' ')
      : keyword.trim();
    const popular = sort !== Options.Default ? sort : undefined;

    if (!query && !popular) {
      return {
        url: 'https://nhentai.net/api/v2/galleries',
        body: { page },
        headers: new Headers(this.defaultHeaders),
        timeout: 20000,
      };
    }

    return {
      url: 'https://nhentai.net/api/v2/search',
      body: { query: query || '*', sort: popular, page },
      headers: new Headers(this.defaultHeaders),
      timeout: 20000,
    };
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page, { sort, language }) =>
    this.prepareListing(page, '', sort, language);

  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page, { sort, language }) =>
    this.prepareListing(page, keyword, sort, language);

  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) => ({
    url: `https://nhentai.net/api/v2/galleries/${mangaId}`,
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  prepareChapterListFetch: Base['prepareChapterListFetch'] = () => undefined;

  prepareChapterFetch: Base['prepareChapterFetch'] = (mangaId) => ({
    url: `https://nhentai.net/api/v2/galleries/${mangaId}`,
    headers: new Headers(this.defaultHeaders),
    timeout: 20000,
  });

  handleDiscovery: Base['handleDiscovery'] = (response: NhListResponse) => ({
    discovery: (response.result || []).map((item) => this.listItemToManga(item)),
  });

  handleSearch: Base['handleSearch'] = (response: NhListResponse) => ({
    search: (response.result || []).map((item) => this.listItemToManga(item)),
  });

  handleMangaInfo: Base['handleMangaInfo'] = (response: NhDetailResponse, mangaId) => {
    if (!response.id) {
      throw new Error('NHentai 详情数据缺失');
    }
    const tags = response.tags || [];
    const title =
      response.title?.japanese || response.title?.pretty || response.title?.english || '未知标题';
    const chapterId = '1';
    return {
      manga: {
        href: `https://nhentai.net/g/${mangaId}/`,
        hash: Base.combineHash(this.id, mangaId),
        source: this.id,
        sourceName: this.name,
        mangaId,
        infoCover: this.buildThumbnail(response.thumbnail?.path || response.cover?.path),
        headers: this.defaultHeaders,
        title,
        latest: '全一话',
        updateTime: response.upload_date
          ? dayjs.unix(Number(response.upload_date)).format('YYYY-MM-DD')
          : undefined,
        author: tags
          .filter((tag) => tag.type === 'artist' && tag.name)
          .map((tag) => tag.name as string),
        tag: tags
          .filter((tag) => tag.type !== 'language' && tag.name)
          .map((tag) => tag.name as string),
        status: MangaStatus.End,
        chapters: [
          {
            hash: Base.combineHash(this.id, mangaId, chapterId),
            mangaId,
            chapterId,
            href: `https://nhentai.net/g/${mangaId}/1/`,
            title: '全一话',
          },
        ],
      },
    };
  };

  handleChapterList: Base['handleChapterList'] = () => ({
    error: new Error(ErrorMessage.NoSupport + 'handleChapterList'),
  });

  handleChapter: Base['handleChapter'] = (response: NhDetailResponse, mangaId, chapterId) => {
    const images = (response.pages || [])
      .map((page) => this.buildImage(page.path))
      .filter(Boolean)
      .map((uri) => ({ uri }));
    return {
      canLoadMore: false,
      chapter: {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        name:
          response.title?.japanese ||
          response.title?.pretty ||
          response.title?.english ||
          '未知标题',
        title: '全一话',
        headers: this.defaultHeaders,
        images,
      },
    };
  };
}

export default new NHentai();
