import { MultipleSeat } from './enum';

/**
 * 双页跨章节分组：两两成对，但要求一对内两张来自同一章节（chapterHash 相同），
 * 否则前一张单独成组。按 batch.length 推进游标，避免末页奇数项与下一章首页错位配对。
 * seat===AToB 保持顺序，BToA 把每组内部反转（第一张换到右栏）。
 * 从 Reader 的 useTakeTwo 抽出，便于直接测试配对边界（奇数页、跨章、反转）。
 */
export const groupIntoSpreads = <T extends { chapterHash: string }>(
  data: T[],
  seat: MultipleSeat
): T[][] => {
  const list: T[][] = [];

  for (let i = 0; i < data.length; ) {
    const batch = data.slice(i, i + 2).reduce<T[]>((dict, item) => {
      if (dict.length <= 0) {
        dict.push(item);
      } else if (dict[0].chapterHash === item.chapterHash) {
        dict.push(item);
      }
      return dict;
    }, []);

    list.push(seat === MultipleSeat.AToB ? batch : batch.reverse());
    i += batch.length;
  }

  return list;
};

/**
 * 双页组换算全局页码：用组内第一项的 pre（章节内全局基址）+ current（章内偏移）-1。
 * 从 Reader 的 multiplePageOf 抽出，使全局页号投影可独立测试。
 */
export const spreadGlobalPage = (items: { pre: number; current: number }[]): number =>
  items[0].pre + items[0].current - 1;
