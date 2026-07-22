import { CacheManager } from '@georstat/react-native-image-cache';
import { AppRegistry } from 'react-native';
import { Dirs } from 'react-native-file-access';
import { name } from './app.json';
import dayjs from 'dayjs';
import App from '~/App';
import * as packageJson from './package.json';

require('dayjs/locale/zh-cn');

// https://day.js.org/docs/en/plugin/advanced-format
dayjs.extend(require('dayjs/plugin/advancedFormat'));
// https://day.js.org/docs/zh-CN/plugin/custom-parse-format
dayjs.extend(require('dayjs/plugin/customParseFormat'));
// https://day.js.org/docs/zh-CN/i18n/changing-locale
dayjs.locale('zh-cn');

process.env.NAME = name;
process.env.VERSION = 'v' + packageJson.version;
process.env.PUBLISH_TIME = packageJson.publishTime;

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
