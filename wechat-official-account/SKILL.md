---
name: wechat-official-account
description: 为微信公众号图文排版，将 Markdown 或已提取的文稿装配成带内联样式的正文 HTML 和可复制预览。支持栏目主题、图注、代码块、引用和微信编辑器兼容校验。适用于公众号文章排版、风格对照和草稿前审阅。
---

# 微信公众号 Skill

基于甲木和摸鱼小李的 [gzh-design-skill 源码](https://github.com/isjiamu/gzh-design-skill/tree/750a50dffdc4abb5e853b98136dad13a57e64ce3)。此版本扩展四套主题、正文结构校验和视频号草稿检查。许可与修改记录见 [README.md](README.md)。

1. 从 Markdown 识别标题、导语、分节、引用、图片、代码和来源。需要提取 Word、PDF 或纯文本时先读 [输入归一化](references/format-normalize.md)。排版已有文稿时保留正文、事实、代码、专名和顺序，按用户授权处理文案。
2. 从 [主题索引](references/theme-index.md) 选定一套主题。用户指定时直接采用，任务已授权选风格时结合题材决定并在交付时注明。新主题按 [主题生成工作流](references/theme-generator.md) 扩展，组件登记到索引。
3. 用所选主题库的 HTML 组件装配。参考库内的题材配方与 Markdown 映射，缺少的图注、行内代码等组件从 [通用组件库](references/common-components.md) 补足，按主题换色。用单一 `section` 包裹正文，文章外标题留给平台标题栏。保留正文引用和署名，省去空组件。
4. 根据 [微信 HTML 与草稿检查](references/wechat-html.md) 处理叶子节点、内联样式、图片来源和视频号原生组件。发布、草稿与平台读回由用户授权范围和当前可用渠道决定。
5. 运行校验和预览脚本。把正文字段和预览外壳分开，检查适合手机的宽度、图片原比例及代码换行。

从仓库根目录运行下列命令，按实际位置替换文章路径。

```bash
python3 wechat-official-account/scripts/validate_gzh_html.py article-body.html
python3 wechat-official-account/scripts/wrap_preview.py article-body.html article-preview.html
```

## 组件转换

- `#` 或 frontmatter 提供文章外标题，`##` 对应章节标题，`###` 对应小标题。按主题处理章节编号，正文已有编号时直接采用。
- 开头引用用于引言，后续引用使用引用块。主题含导读组件时可选取三个要点。关键术语按主题使用下划线或主色强调。
- 图片按原比例缩放，沿用原有图注。代码围栏保留行序、缩进与标点，每行用一个段落。图注和署名缺省时省去对应组件。
- 用户明确需要视频号原生组件时，使用已获准的公众号编辑入口插入并读回文章。只有本地工具时，交付可复制正文和独立的视频引用。

## 添加新主题的规范

在 `references/theme-<标识>.md` 提供五部分。分别是设计变量、组件 HTML、文章装配顺序、题材配方和 Markdown 映射。更新主题索引，从仓库根目录运行 `python3 wechat-official-account/scripts/component_lint.py wechat-official-account`，再对新增组件的实际组合运行正文校验。脚本结果说明本地检查范围，微信编辑器读回和手机预览以平台显示为准。
