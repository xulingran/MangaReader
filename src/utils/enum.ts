/**
 * @description enum of any async status
 * @enum {number}
 */
export enum AsyncStatus {
  Default,
  Pending,
  Fulfilled,
  Rejected,
}

/**
 * @description enum of manga serial status
 * @enum {number}
 */
export enum MangaStatus {
  Unknown,
  Serial,
  End,
}

/**
 * @description enum layoutmode of Reader component
 * @enum {number}
 */
export enum LayoutMode {
  /** 翻页模式 */
  Horizontal = 'horizontal',
  /** 条漫模式 */
  Vertical = 'vertical',
  /** 双页模式 */
  Multiple = 'multiple',
}

/** 应用外观偏好；System 由 Android 当前 uiMode 解析为亮色或深色。 */
export enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export enum ReaderDirection {
  /** 从右向左 */
  Left = 'left',
  /** 从左向右 */
  Right = 'right',
}

export enum ErrorMessage {
  Unknown = '未知错误~',
  NoMore = '没有更多~',
  PluginMissing = '缺少插件~',
  Timeout = '超时~',
  RequestTimeout = '请求超时~',
  MissingChapterInfo = '缺少章节信息~',
  MissingMangaInfo = '缺少漫画信息~',
  MissingImageData = '图片数据缺失~',
  WrongMangaData = '返回了错误的漫画数据~',
  WrongChapterData = '返回了错误的章节数据~',
  ResponseTooLarge = '响应内容过大~',
  WrongPageStructure = '页面数据结构异常~',
  WrongResponse = '响应失败: ',
  /** HTTP 非 2xx 失败模板：与状态码拼接，形如「请求失败（HTTP 404）」 */
  HttpRequestFail = '请求失败（HTTP {status}）',
  WrongDataType = '错误的数据格式',
  AuthFailBIKA = '哔咔漫画 Token 失效，请重新登录（账号密码或 WebView）获取',
  LoginFailBIKA = '哔咔账号或密码错误',
  MissingTokenBIKA = '哔咔登录响应缺少 Token',
  WithoutPermission = '授权失败',
  PushTaskFail = '推送任务失败',
  CloudflareFail = 'cloudflare认证失败，请在Webview里重新校验',
  AccessSourceFail = '访问资源失败',
  ExecutionJobFail = '执行任务失败',
}

export enum Orientation {
  Portrait = 'portrait',
  Landscape = 'landscape',
}

export enum ChapterOptions {
  Multiple = 'multiple',
  Download = 'download',
  Export = 'export',
}

export enum Sequence {
  /** 从小到大 */
  Asc = 'Asc',
  /** 从大到小 */
  Desc = 'Desc',
}

/** 任务类型 */
export enum TaskType {
  Download,
  Export,
}

export enum PositionX {
  Left,
  Mid,
  Right,
}

export enum MultipleSeat {
  /** 第一张 | 第二张 */
  AToB,
  /** 第二张 | 第一张 */
  BToA,
}

export enum PageKeys {
  Enable,
  Disabled,
}

export enum Timer {
  Enable,
  Disabled,
}

export enum SafeArea {
  All,
  None,
  X,
  Y,
}

export enum TemplateKey {
  MANGA_ID = 'MANGA_ID',
  MANGA_NAME = 'MANGA_NAME',
  CHAPTER_ID = 'CHAPTER_ID',
  CHAPTER_NAME = 'CHAPTER_NAME',
  AUTHOR = 'AUTHOR',
  SOURCE_ID = 'SOURCE_ID',
  SOURCE_NAME = 'SOURCE_NAME',
  TAG = 'TAG',
  STATUS = 'STATUS',
  HASH = 'HASH',
  TIME = 'TIME',
}
