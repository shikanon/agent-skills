# 微信公众号 Skill

将 Markdown 或已整理的文稿转换为公众号富文本和可复制预览。沿用上游源码的内联 HTML 组件与两阶段校验，主题负责引言、分节标题、引用、图片和代码块的样式。

沿用上游六套主题，新增四套。分节标题和导语结构各有区别。可下载并打开[四套主题对照页](assets/theme-previews/extended-themes.html)，用同一篇示例比较。

| 主题 | 适用稿件 |
|---|---|
| 钴蓝讲义 | AI 原理、技术教程、图文科普 |
| 晨报版面 | 新闻综述、行业评论、人物通讯 |
| 野外图鉴 | 观察记录、产品评测、案例拆解 |
| 紫墨实验簿 | 实验记录、对照评测、研究复盘 |

从 [SKILL.md](SKILL.md) 开始使用。 [主题索引](references/theme-index.md) 收录十套组件库，[微信 HTML 与草稿检查](references/wechat-html.md) 说明结构和媒体边界。

## 上游和许可

这份修改基于 [甲木与摸鱼小李的 gzh-design-skill](https://github.com/isjiamu/gzh-design-skill/tree/750a50dffdc4abb5e853b98136dad13a57e64ce3)。2026-11-18 增加四套主题，补充正文结构、视频号草稿检查和主题预览，并扩展源码校验器，检查块级元素混入文字叶子节点以及脚本事件属性。此目录继续使用 [AGPL-3.0-or-later](LICENSE)，保留原作者版权。
