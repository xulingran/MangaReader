import { PayloadAction } from '@reduxjs/toolkit';
import { customTheme } from '~/utils';
// choose @types/cheerio instead of default
import '@types/cheerio';

type CustomTheme = typeof customTheme;

declare module 'native-base' {
  interface ICustomTheme extends CustomTheme {}
}

declare global {
  type PartialOption<T, K extends string | number | symbol> = Omit<T, K> & {
    [A in Extract<keyof T, K>]?: T[A];
  };

  type FetchResponseAction<T = undefined> = PayloadAction<
    undefined extends T
      ? { error?: Error; actionId?: string }
      :
          | { error: Error; data?: T; actionId?: string }
          | { error?: undefined; data: T; actionId?: string }
  >;

  interface FetchData {
    url: string;
    method?: 'GET' | 'get' | 'POST' | 'post';
    body?: FormData | Record<string, unknown>;
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
