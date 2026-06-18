---
title: Hello World — 我的第一篇技术博客
date: 2026-06-18
tags: [博客, 折腾]
---

## 为什么写博客？

写博客是一个整理思路、沉淀知识的好方式。这个站点完全用**纯静态文件**搭建，托管在 GitHub Pages 上，零成本、零维护。

## 技术栈

- **HTML + CSS + JS** — 没有任何构建工具，写完直接部署
- **[marked.js](https://github.com/markedjs/marked)** — 客户端 Markdown 渲染
- **[highlight.js](https://highlightjs.org/)** — 代码语法高亮
- **[GitHub Pages](https://pages.github.com/)** — 免费静态托管

## 如何添加新文章？

1. 在 `posts/` 目录下新建一个 `.md` 文件，比如 `my-post.md`
2. 在文件顶部写上 frontmatter：

```yaml
---
title: 文章标题
date: 2026-06-18
tags: [标签1, 标签2]
---
```

3. 接下来写 Markdown 正文
4. 在 `posts/index.json` 中添加一条记录：

```json
{ "slug": "my-post", "title": "文章标题", "date": "2026-06-18", "tags": ["标签1", "标签2"], "excerpt": "简短摘要" }
```

5. 提交并推送到 GitHub，稍等几秒就生效了

## 插入图片

图片放在 `images/` 目录，然后在 Markdown 中用相对路径引用：

```markdown
![描述文字](images/my-screenshot.png)
```

效果如下（示例图片来自占位服务）：

![示例图片](https://placehold.co/600x300/2563eb/white?text=Hello+Blog)

> 提示：建议将图片压缩后再放入仓库，保持加载速度。

## 写在最后

保持记录，保持思考。🎉
