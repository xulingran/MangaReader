// 必须第一个 import：注入 process.env.NAME/VERSION/PUBLISH_TIME，
// 且要先于 App → redux/slice 的模块求值（initialState 在模块加载时读取这些值）
import './bootstrap';
import { CacheManager } from '@georstat/react-native-image-cache';
import { AppRegistry } from 'react-native';
import { Dirs } from 'react-native-file-access';
import { name } from './app.json';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import dayjs from 'dayjs';
import App from '~/App';
import 'dayjs/locale/zh-cn';

// https://day.js.org/docs/en/plugin/advanced-format
dayjs.extend(advancedFormat);
// https://day.js.org/docs/zh-CN/plugin/custom-parse-format
dayjs.extend(customParseFormat);
// https://day.js.org/docs/zh-CN/i18n/changing-locale
dayjs.locale('zh-cn');

CacheManager.config = {
  baseDir: `${Dirs.CacheDir}/images_cache/`,
  // 电子墨水低端设备存储通常 8-32GB：512MB 缓存偏大，LRU 清理可能落在阅读中途造成 IO 抖动。
  // 下调到 256MB；章节离开时 Chapter.tsx 会主动 pruneCache()，避免 LRU 在阅读中触发。
  // 图片无淡入。
  cacheLimit: 256 * 1024 * 1024,
  maxRetries: 2,
  retryDelay: 500,
  sourceAnimationDuration: 0,
  thumbnailAnimationDuration: 0,
};

AppRegistry.registerComponent(name, () => App);
