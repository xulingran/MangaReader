import { describe, expect, it } from '@jest/globals';
import { Plugin } from '~/plugins';
import HComic from '~/plugins/hcomic';
import BZM from '~/plugins/bzm';
import {
  assertJsonSizeWithinLimit,
  createBackupPayload,
  isCurrentMangaRequest,
  normalizeBackup,
  sanitizeFileName,
} from '~/redux/saga';
import { action, initialState, reducer } from '~/redux/slice';
import { normalizeTaskForRestart } from '~/redux/task';
import { AsyncStatus, TaskType } from '~/utils';
import { isAllowedWebviewUrl, parseBikaTokenMessage } from '~/views/Webview';

const cloneInitialState = (): RootState => JSON.parse(JSON.stringify(initialState));

describe('凭据与 WebView 边界', () => {
  it('备份不会包含 Bika Token，且新格式可以直接恢复', () => {
    const state = cloneInitialState();
    (state.plugin as RootState['plugin'] & { extra?: Record<string, string> }).extra = {
      bikaToken: 'top-secret',
      picaToken: 'legacy-secret',
    };
    const payload = createBackupPayload(state);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('top-secret');
    expect(serialized).not.toContain('legacy-secret');
    expect(normalizeBackup(serialized)).toEqual(payload);
  });

  it('备份排除未收藏的搜索缓存，避免无意义的体积和内存峰值', () => {
    const state = cloneInitialState();
    state.dict.manga['MBZ&transient'] = { title: '不应进入备份' } as Manga;

    expect(JSON.stringify(createBackupPayload(state))).not.toContain('不应进入备份');
  });

  it('兼容旧版 percent-encoded JSON 备份', () => {
    const state = cloneInitialState();
    expect(normalizeBackup(encodeURIComponent(JSON.stringify(state))).favorites).toEqual([]);
  });

  it('兼容旧版 base64 + percent-encoded JSON 备份', () => {
    const state = cloneInitialState();
    const encoded = Buffer.from(encodeURIComponent(JSON.stringify(state)), 'utf8').toString(
      'base64'
    );
    expect(normalizeBackup(`data:text/plain;base64,${encoded}`).favorites).toEqual([]);
  });

  it('在创建整份 JSON 字符串前拒绝超过上限的备份', () => {
    expect(() => assertJsonSizeWithinLimit({ text: '漫画'.repeat(50) }, 100)).toThrow(
      '备份数据超过 64MB 限制'
    );
    const value = { text: '漫画', enabled: true };
    expect(assertJsonSizeWithinLimit(value, 1024)).toBe(Buffer.byteLength(JSON.stringify(value)));
  });

  it('只接受 Bika 的单 Token 消息并限制同源导航', () => {
    expect(
      parseBikaTokenMessage(Plugin.BIKA, '{"bikaToken":" token ","nonce":"session"}', 'session')
    ).toBe('token');
    expect(
      parseBikaTokenMessage(Plugin.MBZ, '{"bikaToken":"token","nonce":"session"}', 'session')
    ).toBeUndefined();
    expect(
      parseBikaTokenMessage(Plugin.BIKA, '{"bikaToken":"token","nonce":"wrong"}', 'session')
    ).toBeUndefined();
    expect(
      isAllowedWebviewUrl('https://manhuabika.com/plogin/', 'https://manhuabika.com/home')
    ).toBe(true);
    expect(
      isAllowedWebviewUrl('https://manhuabika.com/plogin/', 'https://evilmanhuabika.com/')
    ).toBe(false);
    expect(
      isAllowedWebviewUrl('https://manhuabika.com/plogin/', 'https://sub.manhuabika.com/')
    ).toBe(false);
    expect(
      isAllowedWebviewUrl('https://manhuabika.com/plogin/', 'https://manhuabika.com:8443/')
    ).toBe(false);
    const scriptUrl = ['java', 'script:alert(1)'].join('');
    expect(isAllowedWebviewUrl('https://manhuabika.com/plogin/', scriptUrl)).toBe(false);
  });
});

describe('并发与任务状态', () => {
  it('每个 loadManga action 都自动获得不同的关联 ID', () => {
    const first = action.loadManga({ mangaHash: 'MBZ&1' });
    const second = action.loadManga({ mangaHash: 'MBZ&1' });
    expect(first.payload.actionId).toBeTruthy();
    expect(second.payload.actionId).not.toBe(first.payload.actionId);
  });

  it('不同漫画的详情请求会独立维护状态', () => {
    const first = action.loadManga({ mangaHash: 'MBZ&1' });
    const second = action.loadManga({ mangaHash: 'MBZ&2' });
    let state = reducer(undefined, first);
    state = reducer(state, second);
    expect(isCurrentMangaRequest(state, 'MBZ&1', first.payload.actionId)).toBe(true);
    expect(isCurrentMangaRequest(state, 'MBZ&2', second.payload.actionId)).toBe(true);
    state = reducer(
      state,
      action.loadMangaCompletion({
        error: new Error('stale'),
        actionId: first.payload.actionId,
        mangaHash: first.payload.mangaHash,
      })
    );

    expect(state.manga.loadByHash['MBZ&1']?.status).toBe(AsyncStatus.Rejected);
    expect(state.manga.loadByHash['MBZ&2']?.status).toBe(AsyncStatus.Pending);
  });

  it('同一漫画的新请求不会被旧响应覆盖', () => {
    const first = action.loadManga({ mangaHash: 'MBZ&1' });
    const second = action.loadManga({ mangaHash: 'MBZ&1' });
    let state = reducer(undefined, first);
    state = reducer(state, second);
    state = reducer(
      state,
      action.loadMangaCompletion({
        error: new Error('stale'),
        actionId: first.payload.actionId,
        mangaHash: first.payload.mangaHash,
      })
    );

    expect(state.manga.loadByHash['MBZ&1']).toEqual({
      status: AsyncStatus.Pending,
      actionId: second.payload.actionId,
    });
  });

  it('旧漫画成功响应不会绕过状态守卫覆盖当前字典', () => {
    const first = action.loadManga({ mangaHash: 'MBZ&1' });
    const second = action.loadManga({ mangaHash: 'MBZ&1' });
    const current = { hash: 'MBZ&1', title: '新详情' } as IncreaseManga;
    const stale = { hash: 'MBZ&1', title: '旧详情' } as IncreaseManga;
    let state = reducer(undefined, first);
    state = reducer(state, second);
    state = reducer(state, action.saveManga(current));
    state = reducer(
      state,
      action.loadMangaCompletion({
        data: current,
        actionId: second.payload.actionId,
        mangaHash: second.payload.mangaHash,
      })
    );
    state = reducer(
      state,
      action.loadMangaCompletion({
        data: stale,
        actionId: first.payload.actionId,
        mangaHash: first.payload.mangaHash,
      })
    );

    expect(state.dict.manga['MBZ&1']?.title).toBe('新详情');
  });

  it('章节加载状态按 hash 隔离，并发完成不会制造当前章节伪空态', () => {
    let state = reducer(undefined, action.loadChapter({ chapterHash: 'MBZ&1&A' }));
    state = reducer(state, action.loadChapter({ chapterHash: 'MBZ&1&B' }));
    state = reducer(
      state,
      action.loadChapterCompletion({
        data: {
          hash: 'MBZ&1&A',
          mangaId: '1',
          chapterId: 'A',
          title: 'A',
          images: [],
          headers: {},
        },
        actionId: 'MBZ&1&A',
      })
    );

    expect(state.chapter.loadByHash['MBZ&1&A']).toBe(AsyncStatus.Fulfilled);
    expect(state.chapter.loadByHash['MBZ&1&B']).toBe(AsyncStatus.Pending);
  });

  it('章节重新加载失败时保留原有离线数据', () => {
    const chapterHash = 'MBZ&1&A';
    const cached = {
      hash: chapterHash,
      mangaId: '1',
      chapterId: 'A',
      title: '离线章节',
      images: [{ uri: 'file:///cached.jpg' }],
      headers: {},
    } as Chapter;
    let state = reducer(
      undefined,
      action.loadChapterCompletion({ data: cached, actionId: chapterHash })
    );

    state = reducer(state, action.loadChapter({ chapterHash }));
    state = reducer(
      state,
      action.loadChapterCompletion({ error: new Error('offline'), actionId: chapterHash })
    );

    expect(state.dict.chapter[chapterHash]).toEqual(cached);
    expect(state.chapter.loadByHash[chapterHash]).toBe(AsyncStatus.Rejected);
  });

  it('任务完成后从 pending 移除当前 job', () => {
    const taskId = 'task-1';
    const jobId = 'job-1';
    const chapterHash = 'MBZ&1&1';
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(
      state,
      action.pushTask({
        data: {
          taskId,
          chapterHash,
          title: '第一话',
          type: TaskType.Download,
          status: AsyncStatus.Default,
          downloadPath: '/tmp',
          queue: [{ index: 0, jobId, source: 'https://example.test/1.jpg' }],
          pending: [],
          success: [],
          fail: [],
        },
      })
    );
    state = reducer(state, action.startJob({ taskId, jobId }));
    expect(state.task.list[0].pending).toEqual([jobId]);
    state = reducer(state, action.endJob({ taskId, jobId, status: AsyncStatus.Rejected }));
    expect(state.task.list[0].pending).toEqual([]);
    expect(state.task.list[0].fail).toEqual([jobId]);
  });

  it('恢复时将中断任务重建为可调度队列', () => {
    const task = cloneInitialState().task;
    task.list = [
      {
        taskId: 'task-1',
        chapterHash: 'MBZ&1&1',
        title: '第一话',
        type: TaskType.Download,
        status: AsyncStatus.Pending,
        downloadPath: '/tmp',
        queue: [
          { index: 0, jobId: 'done', source: 'https://example.test/1.jpg' },
          { index: 1, jobId: 'todo', source: 'https://example.test/2.jpg' },
        ],
        pending: ['todo'],
        success: ['done'],
        fail: [],
      },
    ];

    const normalized = normalizeTaskForRestart(task);
    expect(normalized.list[0]).toMatchObject({
      status: AsyncStatus.Default,
      pending: [],
      fail: [],
    });
    expect(normalized.job.list.map(({ jobId }) => jobId)).toEqual(['todo']);
  });
});

describe('来源与文件名健壮性', () => {
  it('HComic 冷启动时可从持久化章节链接恢复 slug', () => {
    const request = HComic.prepareChapterFetch(
      '123',
      '1',
      1,
      {},
      {
        chapter: {
          href: 'https://h-comic.com/comics/HComic%20%E6%B5%8B%E8%AF%95/1?id=123',
          title: '全一话',
        },
      }
    );
    expect(request.url).toBe('https://h-comic.com/comics/HComic%20%E6%B5%8B%E8%AF%95/1?id=123');
  });

  it('包子漫画筛选值和展示文案没有颠倒', () => {
    const typeFilter = BZM.option.discovery.find((item) => item.name === 'type');
    const alphabetFilter = BZM.option.discovery.find((item) => item.name === 'filter');
    expect(typeFilter?.options[1]).toEqual({ label: '全部', value: 'all' });
    expect(alphabetFilter).toBeDefined();
  });

  it('导出文件名剔除路径穿越和 Windows 保留字符', () => {
    expect(sanitizeFileName('../AUX:<漫画>?*')).toBe('.._AUX__漫画___');
    expect(sanitizeFileName('CON')).toBe('unknown');
  });
});
