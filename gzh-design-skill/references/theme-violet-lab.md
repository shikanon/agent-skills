# 公众号排版组件库 · 紫墨实验簿

用紫色细线分隔实验步骤，居中提要建立开篇焦点，规整的边框强调可核对的观察。

## 设计变量

| 用途 | 色值 |
|---|---|
| 主色 | `#683889` |
| 标题色 | `#30203B` |
| 正文色 | `#3A2C43` |
| 浅底 | `#F5EDF9` |
| 细线 | `#D8C3E4` |
| 辅助色 | `#685773` |

正文 16px，行高 1.85。章节之间用 29–33px 留白。

## 组件 HTML

替换文本槽位时转义 HTML。图片地址使用已确认的素材。多行代码逐行使用 `code-line`，以成对不换行空格保留缩进。

### root

```html
<section style="max-width:677px;margin:0 auto;color:#3A2C43;">{{组件}}</section>
```

### body

```html
<p style="margin:0 0 15px;color:#3A2C43;font-size:16px;line-height:1.85;">{{行内}}</p>
```

### subheading

```html
<h3 style="margin:23px 0 9px;font-size:17px;line-height:1.5;color:#683889;"><span leaf="">{{文字}}</span></h3>
```

### strong

```html
<span style="font-weight:700;color:#683889;"><span leaf="">{{文字}}</span></span>
```

### quote

```html
<section style="margin:18px 0;padding:12px 15px;border-left:3px solid #683889;background-color:#F5EDF9;"><p style="margin:0;color:#3A2C43;font-size:15px;line-height:1.75;">{{行内}}</p></section>
```

### list

```html
<p style="margin:0 0 10px;padding-left:13px;border-left:2px solid #D8C3E4;color:#3A2C43;font-size:16px;line-height:1.78;"><span leaf="">{{项目符号}}</span>{{行内}}</p>
```

### figure

```html
<section style="margin:22px 0 24px;"><p style="margin:0;"><span leaf=""><img src="{{图片地址}}" alt="{{图片说明}}" style="display:block;margin:0 auto;max-width:100%;height:auto;vertical-align:top;" /></span></p><p style="margin:8px 0 0;text-align:center;color:#685773;font-size:13px;line-height:1.6;"><span leaf="">{{图片说明}}</span></p></section>
```

### code

```html
<section style="margin:16px 0 22px;padding:13px 12px;border:1px solid #D8C3E4;border-radius:6px;background-color:#F5EDF9;"><p style="margin:0 0 7px;font-size:12px;line-height:1.5;color:#683889;font-weight:700;"><span leaf="">{{语言}}</span></p>{{代码行}}</section>
```

### code-line

```html
<p style="margin:0;color:#3A2C43;font-size:12px;line-height:1.65;font-family:monospace;word-break:break-all;"><span leaf="">{{文字}}</span></p>
```

### source

```html
<p style="margin:26px 0 8px;padding-top:13px;border-top:1px solid #D8C3E4;color:#685773;font-size:13px;line-height:1.65;">{{行内}}</p>
```

### lead

```html
<section style="margin:17px 0 28px;padding:15px 16px;border-top:2px solid #683889;border-bottom:2px solid #D8C3E4;text-align:center;"><p style="margin:0;font-size:17px;line-height:1.55;color:#30203B;font-weight:650;"><span leaf="">{{文字}}</span></p></section>
```

### heading

```html
<section style="margin:31px 0 13px;padding:8px 0 0;border-top:1px solid #D8C3E4;"><p style="margin:0;font-size:12px;line-height:1.55;color:#683889;font-weight:700;letter-spacing:1px;"><span leaf="">{{编号}} / {{英文标签}}</span></p><p style="margin:0;font-size:21px;line-height:1.55;color:#30203B;font-weight:700;"><span leaf="">{{文字}}</span></p></section>
```

## 文章骨架

`root` → 原生视频（如有）→ `lead` → 逐节 `heading` 与正文组件 → `source`（如有）。署名直接使用用户给出的值；正文已有署名时沿用原文。

## 题材配方

| 主要题材 | 组合 |
|---|---|
| 实验记录、对照评测、研究复盘 | 按问题、设置、结果、解释排列。每张结果图旁标明指标和适用范围，代码紧跟实验设置。 |
| 叙事与访谈 | lead → heading + body → quote 用于原话，figure 用于有信息量的图片。 |
| 清单与教程 | lead → heading + list 或 body → code / figure 按步骤插入。 |

## Markdown 映射

| 输入 | 组件 |
|---|---|
| H1 | 文章标题栏 |
| H2 / H3 | heading / subheading |
| 首段引用 / 其他引用 | lead / quote |
| 段落、强调、列表 | body、strong、list |
| 图片、围栏代码、来源说明 | figure、code、source |
| 表格、行内代码、分割线 | 优先把宽表拆成纵向字段。行内代码和分割线沿用通用组件。 |

“{{行内}}”槽位装入带 `span[leaf]` 的行内 HTML，图片说明留空时省略说明段。
