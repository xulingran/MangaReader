import { Plugin } from '~/plugins';
import { migrateDeletedPluginData } from '~/redux/saga';
import { expect, test } from '@jest/globals';

const legacySource = 'COPY' as Plugin;
const legacyMangaHash = `${legacySource}&legacy-manga`;
const legacyChapterHash = `${legacyMangaHash}&legacy-chapter`;
const mbzMangaHash = `${Plugin.MBZ}&current-manga`;
const mbzChapterHash = `${mbzMangaHash}&current-chapter`;

test('删除漫画源后清理旧数据并回退当前源', () => {
  const data = {
    plugin: {
      source: legacySource,
      list: [
        { value: legacySource, disabled: false },
        { value: Plugin.MBZ, disabled: true },
      ],
      extra: { picaToken: 'legacy-token' },
    },
    favorites: [
      { mangaHash: legacyMangaHash, isTrend: false, enableBatch: false },
      { mangaHash: mbzMangaHash, isTrend: true, enableBatch: true },
    ],
    dict: {
      manga: { [legacyMangaHash]: {}, [mbzMangaHash]: {} },
      chapter: { [legacyChapterHash]: {}, [mbzChapterHash]: {} },
      record: { [legacyChapterHash]: {}, [mbzChapterHash]: {} },
      lastWatch: { [legacyMangaHash]: {}, [mbzMangaHash]: {} },
    },
    task: {
      list: [
        { taskId: 'legacy-task', chapterHash: legacyChapterHash },
        { taskId: 'mbz-task', chapterHash: mbzChapterHash },
      ],
      job: {
        max: 5,
        list: [
          { taskId: 'legacy-task', jobId: 'legacy-job', chapterHash: legacyChapterHash },
          { taskId: 'mbz-task', jobId: 'mbz-job', chapterHash: mbzChapterHash },
        ],
        thread: [
          { taskId: 'legacy-task', jobId: 'legacy-job' },
          { taskId: 'mbz-task', jobId: 'mbz-job' },
        ],
      },
    },
  } as unknown as Pick<RootState, 'dict' | 'favorites' | 'plugin' | 'task'>;

  const migrated = migrateDeletedPluginData(data);

  expect(migrated.plugin.source).toBe(Plugin.MBZ);
  expect(migrated.plugin.list.map((item) => item.value)).toEqual([
    Plugin.MBZ,
    Plugin.MHGM,
    Plugin.RM5,
    Plugin.BZM,
  ]);
  expect(migrated.plugin.list[0].disabled).toBe(true);
  expect(migrated.plugin.extra).toEqual({});
  expect(migrated.favorites.map((item) => item.mangaHash)).toEqual([mbzMangaHash]);
  expect(Object.keys(migrated.dict.manga)).toEqual([mbzMangaHash]);
  expect(Object.keys(migrated.dict.chapter)).toEqual([mbzChapterHash]);
  expect(Object.keys(migrated.dict.record)).toEqual([mbzChapterHash]);
  expect(Object.keys(migrated.dict.lastWatch)).toEqual([mbzMangaHash]);
  expect(migrated.task.list.map((item) => item.taskId)).toEqual(['mbz-task']);
  expect(migrated.task.job.list.map((item) => item.jobId)).toEqual(['mbz-job']);
  expect(migrated.task.job.thread).toEqual([{ taskId: 'mbz-task', jobId: 'mbz-job' }]);
});
