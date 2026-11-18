---
name: gzh-design
description: 为微信公众号图文排版，将 Markdown 或已提取的文稿装配成带内联样式的正文 HTML 和可复制预览。支持栏目主题、图注、代码块、引用和微信编辑器兼容校验。适用于公众号文章排版、风格对照和草稿前审阅。
---

# 公众号图文排版

基于甲木与摸鱼小李的 [gzh-design-skill](https://github.com/isjiamu/gzh-design-skill)。衍生目录的许可与版本记录见 [README.md](README.md)。

1. 从 Markdown 识别标题、导语、分节、引用、图片、代码和来源。需要提取 Word、PDF 或纯文本时先读 [输入归一化](references/format-normalize.md)。排版已有文稿时保留正文、事实、代码、专名和顺序，按用户授权处理文案。
2. 从 [主题索引](references/theme-index.md) 选定一套主题。用户指定时直接采用，任务已授权选风格时结合题材决定并在交付时注明。新主题按 [主题生成工作流](references/theme-generator.md) 扩展，组件登记到索引。
3. 用所选主题库的 HTML 组件装配。参考库内的题材配方与 Markdown 映射，缺少的图注、行内代码等组件从 [通用组件库](references/common-components.md) 补足，按主题换色。用单一 `section` 包裹正文，文章外标题留给平台标题栏。保留正文引用和署名，省去空组件。强调只用于帮助阅读。
4. 根据 [微信 HTML 与草稿检查](references/wechat-html.md) 处理叶子节点、内联样式、图片来源和视频号原生组件。发布、草稿与平台读回由用户授权范围和当前可用渠道决定。
5. 运行校验和预览脚本。把正文字段和预览外壳分开，检查适合手机的宽度、图片原比例及代码换行。

```bash
python3 <skill>/scripts/validate_gzh_html.py article-body.html
python3 <skill>/scripts/wrap_preview.py article-body.html article-preview.html
```

新增或修改主题后运行 `python3 <skill>/scripts/component_lint.py <skill>`。对新增组件的实际组合运行正文校验。脚本结果说明本地检查范围，微信编辑器读回和手机预览以平台显示为准。
