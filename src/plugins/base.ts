import { ErrorMessage } from '~/utils';

interface InitialData {
  id: Plugin;
  name: string;
  shortName?: string;
  description?: string;
  score: number;
  href: string;
  userAgent?: string;
  defaultHeaders?: Record<string, string>;
  option?: {
    discovery: PartialOption<FilterItem, 'defaultValue'>[];
    search: PartialOption<FilterItem, 'defaultValue'>[];
  };
  disabled?: boolean;
  batchDelay?: number;
  injectedJavaScript?: string;
}

interface FilterItem {
  name: string;
  defaultValue: string;
  options: OptionItem[];
}

export enum Plugin {
  MHGM = 'MHGM',
  MBZ = 'MBZ',
  BZM = 'BZM',
  RM5 = 'RM5',
  HCOMIC = 'HCOMIC',
  BIKA = 'BIKA',
  NH = 'NH',
  MOEIMG = 'MOEIMG',
}

export enum Options {
  Default = '$$DEFAULT$$',
}

const isPlugin = (value: string): value is Plugin =>
  (Object.values(Plugin) as string[]).includes(value);

abstract class Base {
  /**
   * @description score rate of plugin
   * @memberof Base
   */
  readonly score: number;
  /**
   * @description key differences between plugins
   * @memberof Base
   */
  readonly id: Plugin;
  /**
   * @description full name, use for display
   * @memberof Base
   */
  readonly name: string;
  /**
   * @description short name of plugin, like icon
   * @memberof Base
   */
  readonly shortName: string;
  /**
   * @description description of the plugin
   * @memberof Base
   */
  readonly description: string;
  readonly href: string;
  readonly userAgent?: string;
  readonly defaultHeaders: Record<string, string>;

  /**
   * @description filter in Discovery and Search page
   * @memberof Base
   */
  readonly option: { discovery: FilterItem[]; search: FilterItem[] };
  /**
   * @description switch of display in plugins list
   * @memberof Base
   */
  readonly disabled: boolean;
  batchDelay: number;
  /**
   * @description run js in webview
   * @memberof Base
   */
  injectedJavaScript?: string;

  /**
   * @description Creates an instance of Base.
   * @memberof Base
   */
  constructor(init: InitialData) {
    const {
      id,
      name,
      shortName = name,
      description = name,
      href,
      userAgent,
      defaultHeaders = {},
      score,
      option = { discovery: [], search: [] },
      disabled = false,
      batchDelay = 1500,
      injectedJavaScript,
    } = init;
    this.id = id;
    this.name = name;
    this.shortName = shortName;
    this.description = description;
    this.href = href;
    this.userAgent = userAgent;
    this.defaultHeaders = defaultHeaders;
    this.score = score;
    this.option = {
      discovery: option.discovery.map((item) => ({
        ...item,
        defaultValue: item.defaultValue || Options.Default,
      })),
      search: option.search.map((item) => ({
        ...item,
        defaultValue: item.defaultValue || Options.Default,
      })),
    };
    this.disabled = disabled;
    this.batchDelay = batchDelay;
    this.injectedJavaScript = injectedJavaScript;
  }

  /**
   * @description encode and return hash
   *   约定：mangaId / chapterId 不允许包含 '&'，否则 splitHash 无法正确解码
   * @static
   * @memberof Base
   */
  static combineHash(id: Plugin, mangaId: string, chapterId?: string): string {
    if (!chapterId) {
      return [id, mangaId].join('&');
    }

    return [id, mangaId, chapterId].join('&');
  }

  /**
   * @description decode and return params
   * @static
   * @memberof Base
   */
  static splitHash(hash: string): [Plugin, string, string] {
    const [plugin, mangaId = '', chapterId = ''] = hash.split('&');
    if (!isPlugin(plugin) || !mangaId) {
      throw new Error(ErrorMessage.WrongDataType);
    }
    return [plugin, mangaId, chapterId];
  }

  /**
   * @description verify hash belong to the plugin
   * @public
   * @param {string} hash
   * @return {*}  {boolean}
   * @memberof Base
   */
  public is(hash: string): boolean {
    const [plugin] = Base.splitHash(hash);
    return plugin === this.id;
  }

  /**
   * @description default and useless function, just for types
   * @public
   * @param {Record<string, any>} _data
   * @memberof Base
   */
  public syncExtraData(_data: Record<string, any>): string | void {}

  /**
   * @description optional: build account login request, plugins without login leave it undefined
   * @public
   * @param {string} _username
   * @param {string} _password
   * @return {*}  {FetchData}
   * @memberof Base
   */
  public prepareLoginFetch?(_username: string, _password: string): FetchData;

  /**
   * @description optional: parse login response into token
   * @public
   * @param {*} _response
   * @return {*}  {({ error: Error; token?: undefined } | { error?: undefined; token: string })}
   * @memberof Base
   */
  public handleLogin?(
    _response: any
  ): { error: Error; token?: undefined } | { error?: undefined; token: string };

  /**
   * @description optional: multi-step account login (e.g. Auth0 PKCE), returns token.
   *   Plugins with single-request login use prepareLoginFetch/handleLogin instead.
   * @public
   * @param {string} _username
   * @param {string} _password
   * @return {*}  {Promise<string>}
   * @memberof Base
   */
  public performLogin?(_username: string, _password: string): Promise<string>;

  /**
   * @description optional: build online favorites request, plugins without online favorites leave it undefined
   * @public
   * @param {number} _page
   * @return {*}  {FetchData}
   * @memberof Base
   */
  public prepareFavoritesFetch?(_page: number): FetchData;

  /**
   * @description optional: parse online favorites response into manga list
   * @public
   * @param {*} _response
   * @return {*}  {({ error: Error; favorites?: undefined } | { error?: undefined; favorites: IncreaseManga[] })}
   * @memberof Base
   */
  public handleFavorites?(
    _response: any
  ): { error: Error; favorites?: undefined } | { error?: undefined; favorites: IncreaseManga[] };

  /**
   * @description check response is hit by cloudflare protect
   * @public
   * @param {cheerio.Root} $
   * @memberof Base
   */
  public checkCloudFlare($: cheerio.Root, cfTitle?: string) {
    const title = $('title').first().text().trim();

    if (title === 'Just a moment...' || (typeof cfTitle === 'string' && title === cfTitle)) {
      throw new Error(`${ErrorMessage.CloudflareFail} - ${this.name}`);
    }
  };

  /**
   * @description accept page param, return body for discovery fetch
   * @abstract
   * @param {number} page
   * @param {Record<string, string>} filter
   * @return {*}  {FetchData}
   * @memberof Base
   */
  abstract prepareDiscoveryFetch(page: number, filter: Record<string, string>): FetchData;

  /**
   * @description accept keyword param, return body for search fetch
   * @abstract
   * @param {string} keyword
   * @param {number} page
   * @param {Record<string, string>} filter
   * @return {*}  {FetchData}
   * @memberof Base
   */
  abstract prepareSearchFetch(
    keyword: string,
    page: number,
    filter: Record<string, string>
  ): FetchData;

  /**
   * @description accept mangaId param, return body for manga info fetch
   * @abstract
   * @param {string} mangaId
   * @return {*}  {FetchData}
   * @memberof Base
   */
  abstract prepareMangaInfoFetch(
    mangaId: string,
    manga?: Pick<IncreaseManga, 'href' | 'title'>
  ): FetchData;

  /**
   * @description accept mangaId and page param, return body or void
   * @abstract
   * @param {string} mangaId
   * @param {number} page
   * @return {*}  {(FetchData | void)}
   * @memberof Base
   */
  prepareChapterListFetch(_mangaId: string, _page: number): FetchData | void {
    return undefined;
  }

  /**
   * @description accept mangaId and chapterId param, return body for chapter fetch
   * @abstract
   * @param {string} mangaId
   * @param {string} chapterId
   * @return {*}  {FetchData}
   * @memberof Base
   */
  abstract prepareChapterFetch(
    mangaId: string,
    chapterId: string,
    page: number,
    extra: Record<string, any>,
    context?: {
      manga?: Pick<IncreaseManga, 'href' | 'title'>;
      chapter?: Pick<ChapterItem, 'href' | 'title'>;
    }
  ): FetchData;

  /**
   * @description crawl data from website or interface
   * @abstract
   * @param {*} response
   * @return {*}  {({ error: Error; update?: undefined } | { error?: undefined; update: IncreaseManga[] })}
   * @memberof Base
   */
  abstract handleDiscovery(
    response: any
  ): { error: Error; discovery?: undefined } | { error?: undefined; discovery: IncreaseManga[] };

  /**
   * @description crawl data from website or interface
   * @abstract
   * @param {*} response
   * @return {*}  {({ error: Error; search?: undefined } | { error?: undefined; search: IncreaseManga[] })}
   * @memberof Base
   */
  abstract handleSearch(
    response: any
  ): { error: Error; search?: undefined } | { error?: undefined; search: IncreaseManga[] };

  /**
   * @description crawl data from website or interface
   * @abstract
   * @param {*} response
   * @return {*}  {({ error: Error; manga?: undefined } | { error?: undefined; manga: IncreaseManga })}
   * @memberof Base
   */
  abstract handleMangaInfo(
    response: any,
    mangaId: string
  ): { error: Error; manga?: undefined } | { error?: undefined; manga: IncreaseManga };

  /**
   * @description crawl data from website or interface
   * @abstract
   * @param {*} response
   * @return {*}  {({ error: Error; chapterList?: undefined }
   *     | { error?: undefined; chapterList: Manga['chapters'] })}
   * @memberof Base
   */
  handleChapterList(
    _response: any,
    _mangaId: string
  ):
    | { error: Error; chapterList?: undefined; canLoadMore?: boolean; nextPage?: number }
    | {
        error?: undefined;
        chapterList: Manga['chapters'];
        canLoadMore: boolean;
        nextPage?: number;
      } {
    return { chapterList: [], canLoadMore: false };
  }

  /**
   * @description crawl data from website or interface
   * @abstract
   * @param {*} response
   * @return {*}  {({ error: Error; chapter?: undefined } | { error?: undefined; chapter: Chapter })}
   * @memberof Base
   */
  abstract handleChapter(
    response: any,
    mangaId: string,
    chapterId: string,
    page: number
  ):
    | {
        error: Error;
        chapter?: undefined;
        canLoadMore?: boolean;
        nextPage?: number;
        nextExtra?: Record<string, any>;
      }
    | {
        error?: undefined;
        chapter: PartialOption<Chapter, 'title'>;
        canLoadMore: boolean;
        nextPage?: number;
        nextExtra?: Record<string, any>;
      };
}

export default Base;
