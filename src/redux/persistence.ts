import { combineHash, splitHash } from '~/plugins';

export type PersistencePair = [string, string];

const favoriteHashSet = (state: RootState) =>
  new Set(state.favorites.map(({ mangaHash }) => mangaHash));

export const buildMangaIndex = (state: RootState): string[] => {
  return state.favorites.flatMap(({ mangaHash }) => {
    const manga = state.dict.manga[mangaHash];
    const lastWatch = state.dict.lastWatch[mangaHash];
    return manga !== undefined || lastWatch !== undefined ? [mangaHash] : [];
  });
};

export const buildChapterIndex = (state: RootState): string[] => {
  const result = new Set<string>();

  state.favorites.forEach(({ mangaHash }) => {
    state.dict.manga[mangaHash]?.chapters.forEach(({ hash: chapterHash }) => {
      if (
        state.dict.chapter[chapterHash] !== undefined ||
        state.dict.record[chapterHash] !== undefined
      ) {
        result.add(chapterHash);
      }
    });
  });

  return Array.from(result);
};

/** 只序列化发生变化的收藏漫画/章节，避免翻页时复制整份离线库。 */
export const buildProgressPairs = (
  state: RootState,
  mangaHashes: Iterable<string>,
  chapterHashes: Iterable<string>
): PersistencePair[] => {
  const favorites = favoriteHashSet(state);
  const pairs: PersistencePair[] = [];

  new Set(mangaHashes).forEach((mangaHash) => {
    if (!favorites.has(mangaHash)) {
      return;
    }
    const manga = state.dict.manga[mangaHash];
    const lastWatch = state.dict.lastWatch[mangaHash];
    if (manga !== undefined || lastWatch !== undefined) {
      pairs.push([mangaHash, JSON.stringify({ manga, lastWatch })]);
    }
  });

  new Set(chapterHashes).forEach((chapterHash) => {
    const [source, mangaId] = splitHash(chapterHash);
    if (!favorites.has(combineHash(source, mangaId))) {
      return;
    }
    const chapter = state.dict.chapter[chapterHash];
    const record = state.dict.record[chapterHash];
    if (chapter !== undefined || record !== undefined) {
      pairs.push([chapterHash, JSON.stringify({ chapter, record })]);
    }
  });

  return pairs;
};
