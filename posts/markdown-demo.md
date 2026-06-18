---
title: Markdown 写作能力演示
date: 2026-06-17
tags: [Markdown, 演示]
---

本文展示本博客支持的 Markdown 语法。

## 标题层级

# 一级标题（一般不常用）
## 二级标题
### 三级标题
#### 四级标题

## 文本样式

- **粗体** `**粗体**`
- *斜体* `*斜体*`
- ~~删除线~~ `~~删除线~~`
- `行内代码` `` `行内代码` ``

## 列表

### 无序列表

- 第一项
- 第二项
  - 嵌套项 A
  - 嵌套项 B
- 第三项

### 有序列表

1. 步骤一
2. 步骤二
3. 步骤三

## 代码块

JavaScript 示例：

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
```

Python 示例：

```python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    left = [x for x in arr[1:] if x <= pivot]
    right = [x for x in arr[1:] if x > pivot]
    return quick_sort(left) + [pivot] + quick_sort(right)

print(quick_sort([3, 6, 8, 10, 1, 2, 1]))
```

Shell 命令：

```bash
#!/bin/bash
echo "Hello from bash!"
ls -la | grep ".md"
```

## 引用

> 优秀的代码本身就是最好的文档。
> —— *Steve McConnell*

嵌套引用：

> 外层引用
>> 内层引用
>
> 继续外层

## 表格

| 语法 | 效果 | 备注 |
|------|------|------|
| `**text**` | **粗体** | 常用 |
| `*text*` | *斜体* | 常用 |
| `` `code` `` | `code` | 行内代码 |
| `[link](url)` | 链接 | 可点击 |

## 链接

- [GitHub](https://github.com)
- [marked.js 文档](https://marked.js.org/)

## 分割线

---

上面的横线就是分割线。

## 图片

图片支持外部 URL 和本地文件：

```markdown
![本地图片](images/demo.png)
![外部图片](https://example.com/photo.jpg)
```

示例：

![占位图片](https://placehold.co/600x200/0f172a/60a5fa?text=Markdown+Demo+Image)

## HTML 混写（部分支持）

Markdown 里可以直接写 HTML：

<details>
<summary>点击展开更多内容</summary>

这是一段被折叠的内容。适合放一些**补充说明**。

- 列表项 1
- 列表项 2

</details>

---

以上就是本博客支持的 Markdown 语法。Happy writing! ✍️
