import Base, { Plugin, Options } from './base';
import { MangaStatus, ErrorMessage } from '~/utils';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';

interface ScriptData<T> {
  props: {
    pageProps: T;
    __N_SSP: boolean;
  };
  page: string;
  query: Record<string, undefined | number | string>;
  buildId: string;
  isFallback: boolean;
  gssp: boolean;
  scriptLoader: string[];
}

interface DiscoverySearchData
  extends ScriptData<{
    books: {
      id: string;
      name: string;
      alias: string[];
      description: string;
      coverUrl: string;
      author: string;
      continued: boolean;
      tags: string[];
      rating: number | null;
      publish: boolean;
      /**
       * @example 2023-10-19T00:00:00.000Z
       */
      updatedAt: string;
      coverUrlRectangle: string;
      coverUrlSquare: string;
    }[];
    tags: { id: string; count: number }[];
    hasNextPage: boolean;
  }> {}

interface MangaData
  extends ScriptData<{
    book: {
      id: string;
      name: string;
      description: string;
      alias: string[];
      tags: string[];
      author: string;
      coverUrl: string;
      coverUrlRectangle: string;
      coverUrlSquare: string;
      rating: number | null;
      continued: boolean;
      viewCount: number;
      publish: boolean;
      /**
       * @example 2023-10-19T00:00:00.000Z
       */
      createdAt: string;
      /**
       * @example 2023-10-19T00:00:00.000Z
       */
      updatedAt: string;
      activeResourceId: string;
      activeResource: {
        id: string;
        description: string;
        coverUrl: string;
        author: string;
        continued: boolean;
        tags: string[];
        chapters: string[];
        resourceKey: string;
        resourceRef: string;
        folderPath: string;
        /**
         * @example 2023-10-19T00:00:00.000Z
         */
        createdAt: string;
        /**
         * @example 2023-10-19T00:00:00.000Z
         */
        updatedAt: string;
        bookId: string;
      };
    };
    onMyShelf: boolean;
    lastReadChapterIndex: number;
    session: string | null;
    adBookBottom: boolean;
    siteDomain: string;
  }> {}

interface ChapterData
  extends ScriptData<{
    bookName: string;
    alias: string[];
    chapterName: string;
    description: string;
    images?: { src: string; scramble: boolean }[];
    chapterAPIPath?: string;
    totalChapter: number;
    tags: string[];
    session: string | null;
    adBookBottom: boolean;
  }> {}

interface ChapterImageData {
  chapter: {
    name: string;
    images: { src: string; scramble: boolean }[];
  };
  description: string;
}

const SITE_URL = 'https://rouman5.com';
const BOOK_PATH_PATTERN = /^(?:https:\/\/rouman5\.com)?\/books\/([^/?#]+)\/?$/;
const DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

function parseNextData<T>($: cheerio.Root): T | undefined {
  const script = $('script#__NEXT_DATA__').first().html();
  return script ? (JSON.parse(script) as T) : undefined;
}

function extractBackgroundImage(style: string): string {
  const match = style.match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i);
  return match?.[1] || '';
}

function formatDate(value: string): string | undefined {
  if (!value || !dayjs(value).isValid()) {
    return undefined;
  }
  return dayjs(value).format('YYYY-MM-DD');
}

/**
 * Next.js App Router 会把 React Flight 数据拆到多个 script 中，甚至可能从 URL 中间切开。
 * 先按脚本顺序还原 Flight 字符串，再提取阅读图片，不能直接在原始 HTML 上匹配 URL。
 */
function extractFlightImages($: cheerio.Root): string[] {
  let flightData = '';

  $('script').each((_index, element) => {
    const script = $(element).html() || '';
    const match = script.match(/self\.__next_f\.push\((\[[\s\S]*\])\)\s*$/);
    if (!match) {
      return;
    }

    try {
      const chunk = JSON.parse(match[1]);
      if (chunk[0] === 1 && typeof chunk[1] === 'string') {
        flightData += chunk[1];
      }
    } catch (_error) {
      // 忽略无关或不完整的 Flight 脚本，最终由空图片校验给出统一解析错误。
    }
  });

  const images: string[] = [];
  const pattern = /"imageUrl":"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(flightData))) {
    if (!images.includes(match[1])) {
      images.push(match[1]);
    }
  }
  return images;
}

const discoveryOptions = [
  {
    name: 'type',
    options: [
      { label: '選擇分類', value: Options.Default },
      { label: '正妹', value: '正妹' },
      { label: '恋爱', value: '恋爱' },
      { label: '出版漫画', value: '出版漫画' },
      { label: '肉慾', value: '肉慾' },
      { label: '浪漫', value: '浪漫' },
      { label: '大尺度', value: '大尺度' },
      { label: '巨乳', value: '巨乳' },
      { label: '有夫之婦', value: '有夫之婦' },
      { label: '女大生', value: '女大生' },
      { label: '狗血劇', value: '狗血劇' },
      { label: '好友', value: '好友' },
      { label: '調教', value: '調教' },
      { label: '动作', value: '动作' },
      { label: '後宮', value: '後宮' },
      { label: '不倫', value: '不倫' },
    ],
  },
  {
    name: 'status',
    options: [
      { label: '選擇狀態', value: Options.Default },
      { label: '連載中', value: 'true' },
      { label: '已完結', value: 'false' },
    ],
  },
  {
    name: 'sort',
    options: [
      { label: '選擇排序', value: Options.Default },
      { label: '更新日期', value: Options.Default },
      { label: '評分', value: 'rating' },
    ],
  },
];

class RouMan5 extends Base {
  constructor() {
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';
    super({
      score: 5,
      id: Plugin.RM5,
      name: '肉漫屋',
      shortName: 'RM5',
      description: '需要代理，只有韩漫',
      href: 'https://rouman5.com/',
      userAgent,
      defaultHeaders: { Referer: 'https://rouman5.com/', 'User-Agent': userAgent },
      option: { discovery: discoveryOptions, search: [] },
    });
  }

  prepareDiscoveryFetch: Base['prepareDiscoveryFetch'] = (page, { type, status, sort }) => {
    return {
      url: 'https://rouman5.com/books',
      body: {
        tag: type === Options.Default ? undefined : type,
        continued: status === Options.Default ? undefined : status,
        sort: sort === Options.Default ? undefined : sort,
        // 新版站点分页从 0 开始，应用内部页码从 1 开始。
        page: Math.max(0, page - 1),
      },
      headers: new Headers(this.defaultHeaders),
    };
  };
  prepareSearchFetch: Base['prepareSearchFetch'] = (keyword, page) => {
    return {
      url: 'https://rouman5.com/search',
      body: {
        term: keyword,
        page: Math.max(0, page - 1),
      },
      headers: new Headers(this.defaultHeaders),
    };
  };
  prepareMangaInfoFetch: Base['prepareMangaInfoFetch'] = (mangaId) => {
    return {
      url: `https://rouman5.com/books/${mangaId}`,
      headers: new Headers(this.defaultHeaders),
    };
  };
  prepareChapterFetch: Base['prepareChapterFetch'] = (mangaId, chapterId, _page, extra) => {
    return {
      url:
        typeof extra.path === 'string'
          ? `https://rouman5.com${extra.path}`
          : `https://rouman5.com/books/${mangaId}/${chapterId}`,
      headers: new Headers(this.defaultHeaders),
    };
  };

  private mapLegacyList = (data: DiscoverySearchData): IncreaseManga[] =>
    data.props.pageProps.books.map((item) => ({
      href: `${SITE_URL}/books/${item.id}`,
      hash: Base.combineHash(this.id, item.id),
      source: this.id,
      sourceName: this.name,
      mangaId: item.id,
      bookCover: item.coverUrl,
      title: item.name,
      updateTime: formatDate(item.updatedAt),
      headers: this.defaultHeaders,
      status: item.continued ? MangaStatus.Serial : MangaStatus.End,
      author: [item.author],
      tag: item.tags,
    }));

  private parseCurrentList = ($: cheerio.Root): IncreaseManga[] => {
    const result: IncreaseManga[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_index, element) => {
      const href = $(element).attr('href') || '';
      const pathMatch = href.match(BOOK_PATH_PATTERN);
      if (!pathMatch || seen.has(pathMatch[1])) {
        return;
      }

      const mangaId = pathMatch[1];
      const title = $(element).find('.truncate').first().text().trim();
      const coverStyle = $(element).find('[style*="background-image"]').first().attr('style') || '';
      const bookCover = extractBackgroundImage(coverStyle);
      if (!title || !bookCover) {
        return;
      }

      const dateText = $(element).text().match(DATE_PATTERN)?.[0] || '';
      seen.add(mangaId);
      result.push({
        href: `${SITE_URL}/books/${mangaId}`,
        hash: Base.combineHash(this.id, mangaId),
        source: this.id,
        sourceName: this.name,
        mangaId,
        bookCover,
        title,
        updateTime: formatDate(dateText),
        headers: this.defaultHeaders,
      });
    });

    return result;
  };

  handleDiscovery: Base['handleDiscovery'] = (text: string | null) => {
    const $ = cheerio.load(text || '');
    const data = parseNextData<DiscoverySearchData>($);
    return {
      discovery: data ? this.mapLegacyList(data) : this.parseCurrentList($),
    };
  };

  handleSearch: Base['handleSearch'] = (text: string | null) => {
    const $ = cheerio.load(text || '');
    const data = parseNextData<DiscoverySearchData>($);
    return {
      search: data ? this.mapLegacyList(data) : this.parseCurrentList($),
    };
  };

  handleMangaInfo: Base['handleMangaInfo'] = (text: string | null, mangaId: string) => {
    const $ = cheerio.load(text || '');
    const data = parseNextData<MangaData>($);
    if (data) {
      const { id, name, tags, author, continued, updatedAt, activeResource } =
        data.props.pageProps.book;

      return {
        manga: {
          href: `${SITE_URL}/books/${id}`,
          hash: Base.combineHash(this.id, id),
          source: this.id,
          sourceName: this.name,
          mangaId: id,
          title: name,
          latest:
            activeResource.chapters.length > 0
              ? activeResource.chapters[activeResource.chapters.length - 1]
              : undefined,
          updateTime: formatDate(updatedAt),
          author: [author],
          tag: tags,
          status: continued ? MangaStatus.Serial : MangaStatus.End,
          chapters: activeResource.chapters
            .map((title, index) => ({
              hash: Base.combineHash(this.id, id, String(index)),
              mangaId: id,
              chapterId: String(index),
              href: `${SITE_URL}/books/${id}/${index}`,
              title,
            }))
            .reverse(),
        },
      };
    }

    const coverElement = $('img[alt$=" cover"]').first();
    const info = coverElement.parent().next();
    const title =
      info.find('.text-xl.text-foreground').first().text().trim() ||
      (coverElement.attr('alt') || '').replace(/\s+cover$/, '').trim();
    if (!mangaId || !title || !coverElement.attr('src')) {
      throw new Error(`${ErrorMessage.WrongResponse}${this.name}页面结构无法识别`);
    }

    const findInfoRow = (label: string) =>
      info
        .find('div')
        .filter((_index, element) => {
          const ownText = $(element).clone().children().remove().end().text().trim();
          return ownText === label;
        })
        .first();
    const authorText = findInfoRow('作者:').find('span').first().text().trim();
    const statusText = findInfoRow('狀態:').find('span').first().text().trim();
    const tagRow = findInfoRow('標籤:');
    const tags = tagRow
      .find('a')
      .toArray()
      .map((element) => $(element).text().trim())
      .filter(Boolean);
    if (tags.length === 0) {
      tags.push(
        ...tagRow
          .find('span')
          .first()
          .text()
          .split(/[,，、\s]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      );
    }

    const chapters = new Map<string, ChapterItem>();
    $(`a[href^="/books/${mangaId}/"]`).each((_index, element) => {
      const href = $(element).attr('href') || '';
      const match = href.match(new RegExp(`^/books/${mangaId}/([^/?#]+)/?$`));
      if (!match) {
        return;
      }
      const chapterId = match[1];
      const chapterTitle =
        $(element).find('.truncate').first().text().trim() || $(element).text().trim();
      if (!chapterTitle) {
        return;
      }
      chapters.set(chapterId, {
        hash: Base.combineHash(this.id, mangaId, chapterId),
        mangaId,
        chapterId,
        href: `${SITE_URL}/books/${mangaId}/${chapterId}`,
        title: chapterTitle,
      });
    });

    const chapterList = Array.from(chapters.values());
    const dateText = info.text().match(DATE_PATTERN)?.[0] || '';
    const status = statusText.includes('完結')
      ? MangaStatus.End
      : statusText.includes('連載')
      ? MangaStatus.Serial
      : MangaStatus.Unknown;

    return {
      manga: {
        href: `${SITE_URL}/books/${mangaId}`,
        hash: Base.combineHash(this.id, mangaId),
        source: this.id,
        sourceName: this.name,
        mangaId,
        title,
        bookCover: coverElement.attr('src'),
        infoCover: coverElement.attr('src'),
        latest: chapterList.at(-1)?.title,
        updateTime: formatDate(dateText),
        author: authorText ? [authorText] : [],
        tag: tags,
        status,
        chapters: chapterList.reverse(),
      },
    };
  };
  handleChapter: Base['handleChapter'] = (
    res: string | ChapterImageData,
    mangaId: string,
    chapterId: string
  ) => {
    if (typeof res === 'string') {
      const $ = cheerio.load(res || '');
      const data = parseNextData<ChapterData>($);
      if (data) {
        const { bookName, chapterName, images = [], chapterAPIPath } = data.props.pageProps;

        return {
          canLoadMore: typeof chapterAPIPath === 'string',
          chapter: {
            hash: Base.combineHash(this.id, mangaId, chapterId),
            mangaId,
            chapterId,
            name: bookName,
            title: chapterName,
            headers: this.defaultHeaders,
            images: images.map((item) => ({
              uri: item.src,
              needUnscramble: !item.src.includes('.gif') && item.scramble,
            })),
          },
          nextExtra: { path: chapterAPIPath },
        };
      }

      const images = extractFlightImages($);
      if (images.length === 0) {
        throw new Error(`${ErrorMessage.WrongResponse}${this.name}章节图片无法识别`);
      }
      const nameElement = $('main .text-lg.text-foreground.flex.justify-center').first();
      const bookName = nameElement.text().trim();
      const chapterName = nameElement.next('div').first().text().trim() || chapterId;

      return {
        canLoadMore: false,
        chapter: {
          hash: Base.combineHash(this.id, mangaId, chapterId),
          mangaId,
          chapterId,
          name: bookName,
          title: chapterName,
          headers: this.defaultHeaders,
          images: images.map((uri) => ({
            uri,
            needUnscramble: !uri.includes('.gif') && uri.includes('/sr:1/'),
          })),
        },
      };
    } else {
      const { name, images } = res.chapter;

      return {
        canLoadMore: false,
        chapter: {
          hash: Base.combineHash(this.id, mangaId, chapterId),
          mangaId,
          chapterId,
          title: name,
          headers: this.defaultHeaders,
          images: images.map((item) => ({
            uri: item.src,
            needUnscramble: !item.src.includes('.gif') && item.scramble,
          })),
        },
      };
    }
  };
}

export default new RouMan5();
