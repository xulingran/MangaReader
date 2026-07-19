# MangaReader

![platform](https://img.shields.io/badge/platform-android-brightgreen)
![last commit](https://img.shields.io/github/last-commit/youniaogu/MangaReader/master)
![license](https://img.shields.io/github/license/youniaogu/MangaReader)
![issues](https://img.shields.io/github/issues-raw/youniaogu/MangaReader)

一个漫画 APP📱，基于 React Native 构建。**本仓库为安卓电子墨水版**：仅支持 Android，全局黑白高对比静态 UI，无任何翻页动画，适配电子纸设备（支持音量键/翻页键/方向键翻页）。应用最低支持 Android 7（API 24），包含 Android 9（API 28）。

- 插件式设计、八个漫画源[插件](#插件)
- 收藏、搜索、批量更新、下载、导出
- 翻页/条漫/平叛双页模式、无限翻页、保存图片
- 数据全本地离线化、支持备份和恢复

<p align="center">
  <img src="./static/demo.gif" alt="demo" />
</p>

## 插件

- [x] [漫画柜 mobile](https://m.manhuagui.com/)（需要代理）
- [x] [漫画 bz](https://mangabz.com/)（需要代理）
- [x] [包子漫画](https://cn.baozimh.com/)（不需要代理但海外 ip 会走 cloudflare，需要在 webview 里通过校验）
- [x] [肉漫屋](https://rouman5.com/)（需要代理）
- [x] [HComic](https://h-comic.com/)（部分页面需要代理或登录）
- [x] [哔咔漫画](https://manhuabika.com/plogin/)（需要代理和登录）
- [x] [nhentai](https://nhentai.net/)（需要代理）
- [x] [MoeImg](https://moeimg.fan/)（浏览和阅读无需登录）

## 使用指南

<div>
  <img src="./static/usage1.jpeg" alt="usage1" width="250">
  <img src="./static/usage2.jpeg" alt="usage2" width="250">
  <img src="./static/usage3.jpeg" alt="usage3" width="250">
  <img src="./static/usage4.jpeg" alt="usage4" width="250">
  <img src="./static/usage5.jpeg" alt="usage5" width="250">
</div>

## 下载

Android：[下载 apk](https://github.com/youniaogu/MangaReader/releases)（电子墨水设备请使用侧载包安装）

## 关于 App

很喜欢看漫画，能在一个 APP 里看完所有的漫画，是我一直以来的想法

这个项目是在工作之余开发的，时间有限，如果遇到问题，欢迎 Issues 和 PR

最后如果你觉得本项目对你有所帮助，可以的话帮忙点个 Star 🌟，非常感谢！
