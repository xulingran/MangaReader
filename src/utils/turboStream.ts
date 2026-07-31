/**
 * React Router v7 `turbo-stream` 编码解码器。
 *
 * manhua.uk 的 `.data` 端点返回 React Router v7 内部的 turbo-stream 格式：
 * 一个扁平的 JSON 数组，元素之间通过 `_N` 引用建立键值映射。
 *
 * 解码规则（经抓包验证，2026-07-30）：
 *
 * - 数组元素按出现顺序编号（0-based）。
 * - 形如 `{"_K": V, ...}` 的对象：键 `K` 是另一元素的索引（该元素通常是
 *   字符串即键名），值 `V` 取决于其类型——
 *   - 正整数：对另一元素的索引引用（递归解码）；
 *   - 负整数：特殊字面量，`-5` → `null`，`-7` → 未定义（解码为
 *     `UNDEFINED` 占位，随后在解析层过滤），`-8` → 正无穷；
 *   - 其他类型（字符串 / 布尔 / 浮点）：原样字面量。
 * - 形如 `[i, j, ...]` 的数组：每个整数元素都是对另一元素的索引引用。
 * - 特殊元组 `["D", ms]`：Unix 毫秒时间戳。本模块返回整数毫秒，调用方可
 *   按需转换；当前来源不消费时间戳字段。
 * - 顶层第一个元素通常是路由头对象（含 `root` / `routes/*` 分发元信息），
 *   数据载荷位于 `data` 路由分支。本模块返回解码后的完整根字典，调用方按
 *   路由名取值。
 *
 * 该格式为 React Router 内部实现细节，站点升级可能变更；解码器独立成模块并配
 * 样本文本单测（见 `__tests__/turboStream.test.ts`），便于将来定位回归。
 */

// undefined 占位：turbo-stream 的 -7。与 null（-5）区分，调用方可在解析时把
// undefined 视为「字段缺失」而非「显式空值」。
export const UNDEFINED: unique symbol = Symbol('turbo-stream undefined');
export type Undefined = typeof UNDEFINED;

// 负整数特殊字面量映射
const SPECIAL_LITERALS: Record<number, null | Undefined | number> = {
  [-5]: null,
  [-7]: UNDEFINED,
  [-8]: Infinity,
};

/** turbo-stream 解码错误。 */
export class TurboStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurboStreamError';
  }
}

/**
 * 解码 turbo-stream 文本并返回根元素（通常是路由头字典）。
 *
 * @param input `.data` 端点返回的原始文本（一个 JSON 数组），或已 JSON.parse
 *   的数组。后者用于上游已按 application/json 解析的场景。
 * @returns 解码后的根元素。对根字典，包含以路由名为键的子字典（`root`、
 *   `routes/<name>`），每个子字典含 `data` 键。
 * @throws {TurboStreamError} 文本不是合法 JSON 数组或结构异常。
 */
export function decodeTurboStream(input: string | any[]): any {
  let arr: any[];
  if (Array.isArray(input)) {
    arr = input;
  } else {
    const text = (input || '').trim();
    if (!text) {
      throw new TurboStreamError('空响应');
    }
    try {
      arr = JSON.parse(text);
    } catch (e) {
      throw new TurboStreamError(`turbo-stream JSON 解析失败: ${(e as Error).message}`);
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new TurboStreamError('turbo-stream 顶层不是非空数组');
  }
  return decodeIndex(arr, 0, new Set());
}

/** 判断值是否为 turbo-stream undefined 占位。 */
export function isUndefined(value: any): value is Undefined {
  return value === UNDEFINED;
}

/** 解码 `arr[index]`，解析索引引用与特殊字面量。 */
function decodeIndex(arr: any[], index: number, seen: Set<number>): any {
  if (index in SPECIAL_LITERALS) {
    return SPECIAL_LITERALS[index];
  }
  // JS 中 Number.isInteger 对 true/false 返回 false，布尔不会被当索引引用
  if (!Number.isInteger(index)) {
    return index;
  }
  if (index < 0 || index >= arr.length) {
    throw new TurboStreamError(`turbo-stream 索引越界: ${index}`);
  }
  if (seen.has(index)) {
    // 环引用：返回占位，避免无限递归（来源数据未观察到环，但防御）
    return UNDEFINED;
  }
  return decodeElement(arr, arr[index], new Set(seen).add(index));
}

function decodeElement(arr: any[], element: any, seen: Set<number>): any {
  if (isPlainObject(element)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(element)) {
      if (!(key.startsWith('_') && key.length > 1)) {
        // 非 _N 键：原样保留（turbo-stream 不产生，但防御）
        result[key] = value;
        continue;
      }
      const keyIndex = Number(key.slice(1));
      if (!Number.isInteger(keyIndex)) {
        throw new TurboStreamError(`turbo-stream 非法键名 ${key}`);
      }
      const decodedKey = decodeIndex(arr, keyIndex, seen);
      if (decodedKey === UNDEFINED) {
        continue;
      }
      result[String(decodedKey)] = decodeValue(arr, value, seen);
    }
    return result;
  }
  if (Array.isArray(element)) {
    // 日期元组 ["D", ms]：返回毫秒数字
    if (element.length === 2 && element[0] === 'D' && typeof element[1] === 'number') {
      return element[1];
    }
    // 普通数组：元素若是整数则视为索引引用
    return element.map((value) => decodeValue(arr, value, seen));
  }
  return element;
}

/**
 * 解码对象的值。
 *
 * - 整数（非布尔）→ 索引引用（递归解码）；
 * - 列表 → 经 decodeElement 处理（识别日期元组并把元素解码为索引引用），
 *   避免作为值的列表（如 queriedAt）漏解码；
 * - 其余（字符串/布尔/浮点/null）原样返回。
 */
function decodeValue(arr: any[], value: any, seen: Set<number>): any {
  if (typeof value === 'boolean') {
    return value;
  }
  if (Number.isInteger(value)) {
    return decodeIndex(arr, value, seen);
  }
  if (Array.isArray(value)) {
    return decodeElement(arr, value, seen);
  }
  return value;
}

/** 是否为普通对象（非数组、非 null）。Turbo-stream 的对象字面量。 */
function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  // 排除数组、Date、Map 等类
  return Object.getPrototypeOf(value) === Object.prototype || value.constructor === Object;
}
