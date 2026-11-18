# Agent Skills · 跨平台技能集

收录微信公众号图文排版、热歌搜索与音乐下载等技能。每个技能目录提供自己的 `SKILL.md`，运行依赖见对应文档。

## 已收录技能列表

| 技能名称 | 功能说明 |
|---------|---------|
| [微信公众号 Skill](wechat-official-account/) | 微信公众号图文排版，支持主题组件、富文本复制预览和 HTML 兼容校验 |
| [多平台视频发布](playwright-video-publisher/) | 使用 Playwright 协助视频号、抖音、快手及 B 站定时投稿，并核验平台回执；快手和 B 站适配器需先做真实页面核验 |
| [热歌搜索与音乐下载](music-search/) | 查询多平台热歌榜、新歌榜与飙升榜，按歌曲和歌手搜索，通过 TXQQ 下载指定版本，核对音频时长、完整解码与 SHA-256 |

## 使用说明

1. 选择所需技能，保留整个目录及随附的脚本、参考文档和素材。
2. 按 Codex、Claude Code 或其他支持 Agent Skills 的客户端说明安装该目录。
3. 按各技能的文档准备运行环境、工具和所需的环境变量。

## 热歌搜索与音乐下载

`music-search/` 包含技能说明、界面配置和两个 Python 脚本。

- `scripts/music_search.py` 查询歌曲及平台原生排行榜，保留平台、榜单顺序、歌曲 ID 和抓取时间。
- `scripts/txqq_music.py` 通过 [music.txqq.pro](https://music.txqq.pro/) 搜索和解析歌曲，下载后核验媒体类型、时长、完整解码与哈希，并保存本地回执。

运行依赖 Python 3.9+、[Go Music DL](https://github.com/guohuiyuan/go-music-dl) 和用于下载验证的 FFmpeg、ffprobe。Go Music DL 已验证版本为 v1.1.3，可从其官方 Releases 下载对应系统的 CLI，将 `music-dl` 加入 PATH，或通过 `MUSIC_DL_BIN` 指定位置。FFmpeg 与 ffprobe 可通过 PATH 或 `FFMPEG`、`FFPROBE` 环境变量指定。

以安装到 `~/.codex/skills/music-search/` 为例：

```bash
# 查询当前新歌榜
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --sources netease --chart 新歌 --limit 10

# 搜索并保存候选结果
python3 ~/.codex/skills/music-search/scripts/txqq_music.py search '歌曲名 歌手' --source netease --output /tmp/music-search.json

# 下载选中的结果，index 从 1 起
python3 ~/.codex/skills/music-search/scripts/txqq_music.py download --receipt /tmp/music-search.json --index 1
```

默认下载目录为 `~/Downloads/资讯/音乐下载/`，可通过 `--outdir` 调整。平台可用性以当次查询与下载验证结果为准，具体使用方式见 [音乐技能说明](music-search/SKILL.md)。

## 关联项目

[Agent-Reach](https://github.com/Panniantong/Agent-Reach) 以 Git 子模块保留在 `Agent-Reach/`。
