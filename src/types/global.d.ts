import { PayloadAction } from '@reduxjs/toolkit';
import { customTheme } from '~/utils';
// choose @types/cheerio instead of default
import '@types/cheerio';

type CustomTheme = typeof customTheme;

declare module 'native-base' {
  interface ICustomTheme extends CustomTheme {}
}

declare global {
  type GET = 'GET' | 'get';
  type POST = 'POST' | 'post';

  type ArrayFirst<T> = T extends [infer U, ...any[]] ? U : any;

  type FetchResponseAction<T = undefined> = PayloadAction<
    undefined extends T
      ? { error?: Error; actionId?: string }
      :
          | { error: Error; data?: T; actionId?: string }
          | { error?: undefined; data: T; actionId?: string }
  >;

  type KeyValuePair = [string, string | null];

  interface FetchData {
    url: string;
    method?: GET | POST;
    body?: FormData | Record<string, any>;
    headers?: Headers;
    timeout?: number;
    /** 仅认证型接口在 401/403 时覆盖通用 HTTP 错误。 */
    authErrorMessage?: string;
  }

  interface OptionItem {
    label: string;
    value: string;
  }

  namespace NodeJS {
    interface ProcessEnv {
      NAME: string;
      VERSION: string;
      PUBLISH_TIME: string;
    }
  }
}
