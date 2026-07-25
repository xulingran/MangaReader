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
  // 电子墨水版：缓存上限 512MB，图片无淡入
  cacheLimit: 512 * 1024 * 1024,
  maxRetries: 2,
  retryDelay: 500,
  sourceAnimationDuration: 0,
  thumbnailAnimationDuration: 0,
};

AppRegistry.registerComponent(name, () => App);
