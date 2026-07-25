# MangaReader（安卓电子墨水版）

一个基于 React Native 的漫画阅读 APP，**仅支持 Android**，面向电子纸设备：全局黑白高对比静态 UI，移除所有装饰动画与程序化翻页动画。采用插件式设计抓取多个漫画网站的内容，数据全部离线存储在本地，支持备份和恢复。

- 仓库：https://github.com/youniaogu/MangaReader
- 当前版本：0.7.10（`package.json` 中的 `version` 与 `publishTime`，以及 `android/app/build.gradle` 中的 `versionCode` / `versionName` 需保持同步）
- 文档与用户界面以中文为主，代码注释中英文混用

## 电子墨水版核心约定

- **无动画**：导航 `animation: 'none'`；阅读器所有 `scrollToIndex/scrollToOffset` 固定 `animated: false`；弹窗/抽屉统一使用 `src/components/Overlay.tsx` / 静态 `Drawer`；禁止 GIF、Spinner、Stagger、摇晃/旋转/弹跳/淡入淡出组件（已全部移除，勿再加回）
- **黑白主题**：支持亮色、深色和跟随系统三态，默认跟随 Android；深色使用纯黑背景、纯白文字/边框及少量中灰，无阴影、透明遮罩和渐变。语义色板在 `src/utils/theme/tokens.ts`；漫画正文、封面与 WebView 内容不反色、不滤镜
- **冷启动主题**：Redux 的 `setting.themeMode` 是持久化、备份和恢复的正式来源；Android SharedPreferences 与系统应用夜间模式仅镜像冷启动主题，确保 Splash 同步，缺失或非法值统一回退为跟随系统
- **横向翻页**：横向/双页模式 FlashList 固定 `scrollEnabled={false}`，内容不跟随手指；翻页滑动由 `src/components/Controller.tsx` 的 swipe Pan 检测（与缩放 Pan 互斥，scale>1 时禁用），松手上报位移，`Reader` 按 `inverted` 归一化后经 `src/utils/reader.ts` 的 `resolveDragTargetIndex` 决策目标页（最多一页、无惯性），再 `scrollToIndex(animated: false)` 瞬时切页；阈值比例 `DRAG_PAGE_THRESHOLD_RATIO = 0.2`
- **实体键翻页**：原生模块 `android/.../eink/EInkKeyModule.java` 仅在阅读页（`setReaderActive(true)`）拦截 VOLUME_UP/PAGE_UP/DPAD_LEFT（上一页）与 VOLUME_DOWN/PAGE_DOWN/DPAD_RIGHT（下一页），按键抬起时发一次 `pageKey` 事件；JS 侧 `src/utils/einkKey.ts` + `src/hooks/usePageKeys.ts`，设置项为 `setting.pageKeys`（旧 `hearing` 迁移而来）
- **按压反馈**：可交互元素按压时瞬时黑白反色、松开恢复（无渐变/透明度动画）；Button 由 `src/utils/theme.ts` 各 variant 的 `_pressed` 覆盖，图标按钮由 `src/components/VectorIcon.tsx` 统一处理，裸 `Pressable` 用 `src/utils/theme/hooks.ts` 的 `usePressedState` 同步翻转底色与文字/图标（token：`pressedBg`/`pressedText`，常态反色的元素按下回落 `bg`/`text`）；封面与漫画图不反色
- **图片内存**：普通图直接 `CachedImage` 渲染 + `onLoad` 取尺寸，不生成整张 base64；解密/base64 图写入临时文件，状态只保存 `file://` URI 与尺寸，离屏释放；Canvas 解码封顶 8MP；图片缓存上限 512MB、淡入 0（`index.js`）；仅预取下一页
- **设置迁移**：`src/utils/common.ts` 的 `migrateSetting` 剔除旧 `light/animated`、把 `hearing` 映射为 `pageKeys`，缺少 `themeMode` 时补为跟随系统，首次升级强制横向单页；`syncDataSaga` 与 `restoreSaga` 都会调用

## 技术栈

- **React Native 0.81.6** + React 19.1.4 + TypeScript 5.9.3（Node >= 20.19.4，`.nvmrc` 指定 24.18.0）
- **Android 构建基线**：minSdk 24（覆盖 Android 9 / API 28）、compileSdk / targetSdk 36、Gradle 8.14.3、Android Gradle Plugin 8.11.0、Kotlin 2.1.20、NDK 27.1；当前保留旧架构（`newArchEnabled=false`）作为迁移阶段
- **状态管理**：Redux Toolkit + redux-saga（`src/redux/`），dev 环境启用 redux-logger；jest 环境下不启动 saga（`store.ts`）
- **UI**：NativeBase 3.4（通过 patch-package 打了补丁，见 `patches/native-base+3.4.28.patch`，移除了 SSRProvider）、react-navigation（native-stack）、react-native-reanimated 3.19（仅保留缩放/平移的直接操控）、@shopify/flash-list 1.8
- **抓取**：cheerio 解析 HTML，自定义 fetch 封装（`src/utils/fetch.ts`）；webview（`src/views/Webview.tsx`）使用系统 WebView Cookie 会话过 Cloudflare 校验和登录
- **存储**：react-native-mmkv（`src/utils/storage.ts` 封装，可切换回 AsyncStorage）、react-native-file-access 读写下载文件、@georstat/react-native-image-cache 图片缓存
- **包管理**：只能用 yarn（`preinstall` 钩子里 `only-allow yarn` 强制）

## 常用命令

```bash
yarn install               # 安装依赖（postinstall 自动执行 patch-package）
yarn start                 # 启动 Metro
yarn android               # 运行 Android debug 包
yarn build-android         # 打包 Android release（cd android && ./gradlew assembleRelease）
yarn build-android-sideload # 打包个人侧载 APK（assembleSideload：继承 release 优化 + debug 签名）
yarn lint                  # eslint 校验 **/*.{ts,tsx}
yarn typecheck             # TypeScript 静态类型检查
yarn test                  # jest
yarn jsonschema            # 重新生成 src/schema/*.json（见下文「状态与 Schema」）
yarn clean                 # react-native-clean-project 深度清理
```

Windows 环境下注意：`yarn build-android*` 里的 `./gradlew` 是 Unix 写法，在 cmd/PowerShell 中需用 `gradlew.bat`。

## 目录结构与模块划分

```
bootstrap.js           # 注入 process.env.NAME/VERSION/PUBLISH_TIME；必须最先加载
                       # （initialState 在模块求值时读取这些值，晚于 slice 求值注入会固化成 undefined）
index.js               # 入口：第一个 import './bootstrap'，dayjs 中文 locale、
                       # 配置图片缓存（512MB 上限、淡入 0）、AppRegistry 注册
android/app/src/main/java/com/mangareader/
└── eink/              # EInkKeyModule / EInkKeyPackage：实体翻页键原生桥接
src/
├── App.tsx            # 导航与 Provider 组装（animation: 'none'）；底部导出 *StateType 供 schema 生成用
├── plugins/           # 插件系统（核心）：base.ts 定义抽象基类 Base 与 Plugin 枚举，
│                      # 其余每个文件对应一个漫画源（mbz、mhgm、bzm、rm5、hcomic、bika、nh、moeimg），
│                      # index.ts 汇总为 PluginMap
├── redux/             # slice.ts（单一 rootSlice + initialState）、saga.ts（全部副作用，
│                      # 约 1200 行：抓取、持久化、批量更新、下载/导出任务、备份恢复）、store.ts
├── schema/            # 由 TS 类型生成的 JSON Schema，运行时校验持久化/备份数据
├── views/             # 8 个页面：Home（书架）、Discovery、Search、Detail、Chapter（阅读器）、
│                      # Plugin、Webview、About
├── components/        # 共享组件（Reader、Controller、ComicImage、Bookshelf、Overlay 等）
├── hooks/             # 自定义 hooks（usePageKeys、useInterval、usePrevNext 等）
├── utils/             # enum.ts（枚举与 ErrorMessage）、common.ts（工具函数、加密解密、
│                      # schema 校验、migrateSetting）、fetch.ts、storage.ts、reader.ts（拖拽决策）、
│                      # einkKey.ts、theme/
├── types/             # 全局 ambient 类型（global.d.ts、store.d.ts、plugins.d.ts、router.d.ts），
│                      # RootState 等类型全局可用，无需 import
__tests__/             # jest 测试（App 冒烟、reader 翻页决策、migrateSetting 迁移）
jest.setup.js          # jest 原生模块 mock（mmkv、file-access、Keystore、image-cache 等）
patches/               # patch-package 补丁
```

## 插件系统

这是本项目最核心的设计。每个漫画源是 `src/plugins/base.ts` 中抽象类 `Base` 的一个子类实例：

- 子类需实现 5 个 `prepare*Fetch` 方法（返回 `FetchData` 描述请求）和 5 个 `handle*` 方法（把响应解析成统一数据结构）：discovery（发现页）、search、mangaInfo、chapterList、chapter
- 漫画/章节的唯一标识是 hash：`combineHash(plugin, mangaId, chapterId?)`，格式为 `插件ID&mangaId&chapterId`，用 `splitHash` 解码
- 新增加插件：新建文件继承 `Base` → 在 `Plugin` 枚举中登记 → 在 `src/plugins/index.ts` 的 `PluginMap` 中注册
- 部分插件需要代理、webview 过 Cloudflare（`checkCloudFlare` 辅助方法）或登录态；Bika Token 由 WebView 获取后仅存入 Android Keystore（`SecureTokenModule`），不进入 Redux/备份
- `batchDelay` 控制批量更新时的请求间隔，避免触发源站风控

## 状态与 Schema

- 全局状态类型 `RootState` 定义在 `src/types/store.d.ts`（全局声明），初始值在 `src/redux/slice.ts` 的 `initialState`
- 持久化数据（favorites、dict、plugin、setting、task 等）存储在 MMKV，key 定义在 `src/utils/common.ts` 的 `storageKey`
- `src/schema/*.json` 是由 `typescript-json-schema` 从 TS 类型生成的 JSON Schema，saga 在启动加载和恢复备份时用 `json-schema-library` 的 `Draft07` 校验数据合法性
- **改动 `RootState` 相关类型后必须运行 `yarn jsonschema` 重新生成 schema**（pre-commit 钩子也会执行）

## 代码规范

- Prettier：行宽 100、单引号、句尾分号、缩进 2 空格、ES5 尾随逗号、`endOfLine: auto`
- ESLint：继承 `@react-native` 配置
- 路径别名：`~/` 映射到 `src/`（`tsconfig.json` 的 paths + `babel.config.js` 的 module-resolver，两处需保持一致）
- 面向用户的文案（错误提示、toast 等）使用中文，集中在 `src/utils/enum.ts` 的 `ErrorMessage` 等枚举中

## 测试

- jest + `react-native` preset（`jest.config.js` + `jest.setup.js` 原生模块 mock），运行 `yarn test`
- `__tests__/`：App 冒烟、`reader.test.tsx`（拖拽决策纯函数 + 组件级无动画断言）、`migrateSetting.test.ts`（旧设置/旧备份迁移）
- 无 CI 流水线：`.github/` 下只有 issue 模板，没有 workflow

## 提交与发布

- Husky pre-commit（`.husky/pre-commit`）依次执行：`yarn lint` → `yarn jsonschema`
- 发布：`yarn build-android` 打 release 包上传 GitHub Releases；`yarn build-android-sideload` 打个人侧载包（继承 release 的 R8 + 资源裁剪，debug 签名，可直接安装）
- Android 仅构建 ARMv7/ARM64（`gradle.properties` 的 `reactNativeArchitectures`），Hermes 开启；fresco 仅保留静态 WebP（`webpsupport`），无动态 GIF/WebP 解码

## 安全注意事项

- 不要把签名证书、keystore 提交进仓库
- 用户凭据只保存在设备本地（WebView 系统 Cookie 存储 / Android Keystore），不进入 Redux、备份或任何自有服务器
- 插件抓取第三方网站，注意遵守 `batchDelay` 限速，避免高频请求
