import Base, { Plugin } from './base';
import { MangaStatus, ErrorMessage } from '~/utils';
import { Buffer } from 'buffer';
import dayjs from 'dayjs';

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
  constructor() {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    super({
      score: 5,
      id: Plugin.HCOMIC,
      name: 'HComic',
      shortName: 'HComic',
      description: '部分页面需要代理',
      href: 'https://h-comic.com/',
      userAgent,
      defaultHeaders: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://h-comic.com/',
      },
    });
  }

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
