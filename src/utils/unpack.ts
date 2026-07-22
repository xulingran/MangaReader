const PACKER_SIGNATURE = /function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)/;
const TOKEN_PATTERN = /\b[0-9A-Za-z]+\b/g;
const MAX_PACKED_CHARS = 2 * 1024 * 1024;
const MAX_UNPACKED_CHARS = 8 * 1024 * 1024;
const MAX_DICTIONARY_ENTRIES = 10_000;
const MAX_TOKEN_REPLACEMENTS = 200_000;

const findMatching = (source: string, start: number, open: string, close: string): number => {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === open) {
      depth += 1;
    } else if (character === close && --depth === 0) {
      return index;
    }
  }

  throw new Error('压缩脚本结构不完整');
};

const splitArguments = (source: string): string[] => {
  const result: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let depth = 0;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
};

export const decodeJavaScriptString = (literal: string): string => {
  const quote = literal[0];
  if ((quote !== '"' && quote !== "'") || literal.at(-1) !== quote) {
    throw new Error('脚本字符串格式无效');
  }

  let result = '';
  for (let index = 1; index < literal.length - 1; index++) {
    const character = literal[index];
    if (character !== '\\') {
      result += character;
      continue;
    }

    const escaped = literal[++index];
    const simpleEscapes: Record<string, string> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '0': '\0',
      '\\': '\\',
      '"': '"',
      "'": "'",
    };
    if (escaped in simpleEscapes) {
      result += simpleEscapes[escaped];
    } else if (escaped === 'x') {
      const code = literal.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(code)) {
        throw new Error('脚本十六进制转义无效');
      }
      result += String.fromCharCode(Number.parseInt(code, 16));
      index += 2;
    } else if (escaped === 'u') {
      const code = literal.slice(index + 1, index + 5);
      if (!/^[0-9A-Fa-f]{4}$/.test(code)) {
        throw new Error('脚本 Unicode 转义无效');
      }
      result += String.fromCharCode(Number.parseInt(code, 16));
      index += 4;
    } else if (escaped === '\n') {
      // JavaScript line continuation.
    } else if (escaped === '\r' && literal[index + 1] === '\n') {
      index += 1;
    } else {
      result += escaped;
    }
  }
  return result;
};

const decodeToken = (token: string, radix: number): number => {
  let value = 0;
  for (const character of token) {
    const digit =
      character >= '0' && character <= '9'
        ? character.charCodeAt(0) - 48
        : character >= 'a' && character <= 'z'
          ? character.charCodeAt(0) - 87
          : character.charCodeAt(0) - 29;
    if (digit < 0 || digit >= radix) {
      return Number.NaN;
    }
    value = value * radix + digit;
  }
  return value;
};

/** 解开站点使用的 Dean Edwards Packer，不执行任何第三方 JavaScript。 */
export const unpackPacker = (source: string): string => {
  if (source.length > MAX_PACKED_CHARS) {
    throw new Error('压缩脚本超过大小限制');
  }
  const signature = PACKER_SIGNATURE.exec(source);
  if (!signature) {
    throw new Error('不支持的压缩脚本');
  }
  const bodyStart = source.indexOf('{', signature.index + signature[0].length);
  const bodyEnd = findMatching(source, bodyStart, '{', '}');
  const callStart = source.indexOf('(', bodyEnd + 1);
  if (callStart < 0 || source.slice(bodyEnd + 1, callStart).trim() !== '') {
    throw new Error('压缩脚本调用无效');
  }
  const callEnd = findMatching(source, callStart, '(', ')');
  const args = splitArguments(source.slice(callStart + 1, callEnd));
  if (args.length < 4) {
    throw new Error('压缩脚本参数不足');
  }

  const payload = decodeJavaScriptString(args[0]);
  const radix = Number(args[1]);
  const count = Number(args[2]);
  const dictionaryMatch = args[3].match(/^(?:\s*)(["'][\s\S]*["'])\.split\(\s*(["']\|["'])\s*\)$/);
  if (!Number.isInteger(radix) || radix < 2 || radix > 62 || !Number.isInteger(count)) {
    throw new Error('压缩脚本进制或字典长度无效');
  }
  if (!dictionaryMatch) {
    throw new Error('压缩脚本字典无效');
  }
  const dictionary = decodeJavaScriptString(dictionaryMatch[1]).split('|');
  if (count < 0 || count > dictionary.length || dictionary.length > MAX_DICTIONARY_ENTRIES) {
    throw new Error('压缩脚本字典不完整');
  }

  const chunks: string[] = [];
  let cursor = 0;
  let outputLength = 0;
  let tokenCount = 0;
  TOKEN_PATTERN.lastIndex = 0;
  for (let match = TOKEN_PATTERN.exec(payload); match; match = TOKEN_PATTERN.exec(payload)) {
    tokenCount += 1;
    if (tokenCount > MAX_TOKEN_REPLACEMENTS) {
      throw new Error('压缩脚本 token 数量超过限制');
    }
    const prefix = payload.slice(cursor, match.index);
    const token = match[0];
    const index = decodeToken(token, radix);
    const replacement = Number.isInteger(index) && index < count && dictionary[index]
      ? dictionary[index]
      : token;
    outputLength += prefix.length + replacement.length;
    if (outputLength > MAX_UNPACKED_CHARS) {
      throw new Error('解压脚本超过大小限制');
    }
    chunks.push(prefix, replacement);
    cursor = match.index + token.length;
  }
  const suffix = payload.slice(cursor);
  if (outputLength + suffix.length > MAX_UNPACKED_CHARS) {
    throw new Error('解压脚本超过大小限制');
  }
  chunks.push(suffix);
  return chunks.join('');
};

export const parseJavaScriptStringArray = (source: string): string[] => {
  if (source.length > MAX_PACKED_CHARS) {
    throw new Error('脚本数组超过大小限制');
  }
  const value = source.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new Error('脚本数组格式无效');
  }
  const content = value.slice(1, -1).trim();
  const items = content ? splitArguments(content) : [];
  if (items.length > MAX_DICTIONARY_ENTRIES) {
    throw new Error('脚本数组条目过多');
  }
  return items.map(decodeJavaScriptString);
};
