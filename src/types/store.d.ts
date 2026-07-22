import {
  AsyncStatus,
  MangaStatus,
  Sequence,
  LayoutMode,
  ThemeMode,
  ReaderDirection,
  MultipleSeat,
  PageKeys,
  Timer,
  TaskType,
} from '~/utils';
import { Plugin } from '~/plugins';

declare global {
  interface Manga {
    href: string;
    hash: string;
    source: Plugin;
    sourceName: string;
    mangaId: string;
    // redundancy data for init after upgrade
    // remove it when next version
    cover?: string;
    bookCover: string;
    infoCover: string;
    headers?: Record<string, string>;
    title?: string;
    latest: string;
    updateTime: string;
    author: string[];
    tag: string[];
    status: MangaStatus;
    chapters: ChapterItem[];
  }
  interface IncreaseManga
    extends PartialOption<
      Manga,
      | 'latest'
      | 'updateTime'
      | 'author'
      | 'tag'
      | 'status'
      | 'chapters'
      | 'bookCover'
      | 'infoCover'
      | 'title'
    > {}
  interface ChapterItem {
    hash: string;
    mangaId: string;
    chapterId: string;
    href: string;
    title: string;
  }
  interface Chapter {
    hash: string;
    mangaId: string;
    chapterId: string;
    /** 漫画名 */
    name?: string;
    /** 章节名 */
    title: string;
    headers?: Record<string, string>;
    images: { uri: string; needUnscramble?: boolean }[];
  }
  interface Release {
    loadStatus: AsyncStatus;
    name: string;
    version: string;
    publishTime: string;
    latest?: LatestRelease;
  }
  interface LatestRelease {
    url: string;
    version: string;
    changeLog: string;
    publishTime: string;
    file?: {
      apk: { size: number; downloadUrl: string };
      ipa: { size: number; downloadUrl: string };
    };
  }
  interface Task {
    taskId: string;
    chapterHash: string;
    title: string;
    type: TaskType;
    status: AsyncStatus;
    downloadPath: string;
    headers?: Record<string, string>;
    queue: { index: number; source: string; jobId: string }[];
    pending: string[];
    success: string[];
    fail: string[];
  }
  interface Job {
    taskId: string;
    jobId: string;
    chapterHash: string;
    type: TaskType;
    status: AsyncStatus;
    source: string;
    index: number;
    headers?: Record<string, string>;
  }

  interface RootState {
    app: {
      launchStatus: AsyncStatus;
      message: string[];
    };
    datasync: {
      syncStatus: AsyncStatus;
      clearStatus: AsyncStatus;
      backupStatus: AsyncStatus;
      restoreStatus: AsyncStatus;
    };
    release: Release;
    setting: {
      /** 布局模式 */
      mode: LayoutMode;
      /** 应用外观：亮色、深色或跟随系统 */
      themeMode: ThemeMode;
      /** 漫画阅读方向 */
      direction: ReaderDirection;
      /** 双页模式的图片位置 */
      seat: MultipleSeat;
      /** 章节排列顺序 */
      sequence: Sequence;
      /** 是否监听实体翻页键 */
      pageKeys: PageKeys;
      /** 定时翻页 */
      timer: Timer;
      timerGap: number;
      androidDownloadPath: string;
    };
    plugin: {
      source: Plugin;
      list: {
        name: string;
        label: string;
        value: Plugin;
        score: number;
        href: string;
        userAgent?: string;
        description: string;
        disabled: boolean;
        injectedJavaScript?: string;
      }[];
    };
    batch: {
      loadStatus: AsyncStatus;
      stack: string[];
      queue: string[];
      success: string[];
      fail: string[];
    };
    favorites: { mangaHash: string; isTrend: boolean; enableBatch: boolean }[];
    search: {
      filter: Record<string, string>;
      keyword: string;
      page: number;
      isEnd: boolean;
      loadStatus: AsyncStatus;
      list: string[];
    };
    discovery: {
      filter: Record<string, string>;
      page: number;
      isEnd: boolean;
      loadStatus: AsyncStatus;
      list: string[];
    };
    manga: {
      loadByHash: Record<string, { status: AsyncStatus; actionId: string }>;
    };
    chapter: {
      loadByHash: Record<string, AsyncStatus>;
      openDrawer: boolean;
      showDrawer: boolean;
    };
    task: {
      list: Task[];
      job: {
        max: number;
        list: Job[];
        thread: { taskId: string; jobId: string }[];
      };
    };
    dict: {
      manga: Record<string, Manga | undefined>;
      chapter: Record<string, Chapter | undefined>;
      record: Record<
        string,
        { total: number; progress: number; imagesLoaded: number[]; isVisited: boolean }
      >;
      lastWatch: Record<string, { page?: number; chapter?: string; title?: string }>;
    };
  }
}
