---
title: Codex 桌面版接入 DeepSeek 完全指南
date: 2026-06-20
tags: [工具, AI, DeepSeek, Codex]
---

# Codex 桌面版接入 DeepSeek 完全指南

**TL;DR:** 国内 OpenAI 中转站近期大规模关停。用 CC Switch 做本地路由转发，几分钟就能让 Codex 桌面版改用 DeepSeek 的 API，成本低至 10 块钱能用很久。

## 背景

2026 年中，国内多家 OpenAI API 中转代理服务陆续停止运营，直接依赖这些中转站访问 GPT 的 Codex 用户面临断联。

DeepSeek 的 API 价格在国内模型里极具竞争力，且支持 OpenAI 兼容接口——这意味着不需要改 Codex 的代码，只需要在中间加一层协议转换。

## 前置准备

- 一台 Mac / Windows / Linux 设备
- Codex 桌面版（最新版本）
- 一个 DeepSeek 账号（platform.deepseek.com）

## 操作步骤

### 1. 下载 Codex 桌面版

官方 GitHub 在国内下载较慢，可以用这个镜像源：

[Wangnov/codex-app-mirror](https://github.com/Wangnov/codex-app-mirror)

该镜像每 15 分钟同步一次，SHA256 可校验，支持 Mac 增量更新。

### 2. 安装 CC Switch

CC Switch 是一个免费开源工具，负责把 Codex 发出的 OpenAI 格式请求，转发到 DeepSeek 的 API。

从 GitHub 下载对应平台的版本：

[farion1231/cc-switch](https://github.com/farion1231/cc-switch/tree/main)

### 3. 获取 DeepSeek API Key

前往 [platform.deepseek.com](https://platform.deepseek.com) 注册并申请 API Key。试玩的话先充 10 块钱，可以用很久。

### 4. 配置 CC Switch

打开 CC Switch，添加 DeepSeek 的配置：

![CC Switch 配置界面](/images/cc-switch-config.png)

只需要填写刚才申请的 API Key。注意开启「路由设置」选项：

![路由设置](/images/cc-switch-routing.png)

### 5. 验证连通性

在 Codex 中尝试发起一次对话请求。如果配置正确，Codex 应该能够正常与 DeepSeek 交互。

![验证连通性](/images/codex-verify.png)

> **注意：** 使用 CC Switch 时需要关掉电脑上的全部代理工具，包括浏览器的 Proxy 代理设置，否则代理冲突会导致 CC Switch 工作异常。

## 原理简述

```
Codex → CC Switch (本地) → DeepSeek API
```

CC Switch 做的事情很简单：监听本地端口，把 OpenAI 格式的 HTTP 请求重写为 DeepSeek 兼容的请求，然后转发出去。整个过程不涉及数据出域，API Key 也只在本地缓存。

## 局限与替代方案

- **DeepSeek 的能力与 GPT-5 有差距**：在复杂推理、代码生成等场景下，DeepSeek 的表现可能不如 GPT-5。如果对质量要求极高，可以考虑保留一个 GPT 备用方案。
- **代理冲突问题**：如步骤 5 所述，系统代理可能与 CC Switch 冲突，需要手动关闭。
- **替代工具**：除了 CC Switch，也可以考虑使用 [one-api](https://github.com/songquanpeng/one-api) 等更通用的 API 聚合方案，功能更丰富但配置也更复杂。

## 参考链接

- [知乎专栏：Codex 接入 DeepSeek 方案总结](https://zhuanlan.zhihu.com/p/2048865370451218549)
- [B 站视频教程：Codex 完美接入 DeepSeek](https://www.bilibili.com/video/BV1ZejV65EAr/)
