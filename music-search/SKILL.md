---
name: music-search
description: "实时搜索热歌、浏览音乐平台排行榜，并通过 music.txqq.pro 搜索、解析和下载指定音乐。适用于热歌榜/飙升榜/新歌榜、歌曲与歌手搜索、榜内筛选、TXQQ 音乐下载，以及搜索到本地音频验证的完整流程。"
---

# 热歌搜索与音乐下载

通过已安装的 `music-dl` 查询音乐平台的实时元数据。优先运行本技能的脚本；原生 `music-dl -k` 会进入交互式 TUI，不能添加不存在的 `--json` 或排行榜命令。

需要热门程度证据时用 Go Music DL 的原生排行榜；需要从 [music.txqq.pro](https://music.txqq.pro/) 下载时用本技能的 `txqq_music.py`。两条流程按同一平台的歌曲 ID 衔接，保留原唱、版本与时长。

## 查询

脚本只依赖 Python 3.9+ 标准库，默认输出 JSON。把下例中的 `~` 展开为当前用户目录。

```bash
# 当前热歌：默认分别读取网易云、QQ、酷我的热歌榜，每个平台取前 10 首
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --limit 10

# 指定平台与榜单；先发现榜单，再用真实名称或 ID 查询
python3 ~/.codex/skills/music-search/scripts/music_search.py charts --sources netease,qq --match 飙升
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --sources qq --chart 飙升 --limit 10
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --sources qq --chart-id 26 --limit 10

# 在热歌榜中找歌手/歌曲，保留原榜单顺序
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --match 周杰伦 --limit 10

# 关键词搜索；结果顺序是搜索返回顺序，不代表热度排名
python3 ~/.codex/skills/music-search/scripts/music_search.py search '周杰伦 晴天' --sources netease,qq,kuwo --limit 5

# 适合直接阅读的表格；--output 可保存本次输出
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --limit 5 --format table
```

`--sources` 接受逗号分隔的平台代码。默认三个来源已经过实时验证；其他榜单来源可用 `kugou,migu,soda,apple`，搜索还可选择 `qianqian,fivesing,jamendo,joox,bilibili`。支持接口不等于当次可用，按运行结果报告。未指定其他平台时，不必加载所有来源。`--chart-id` 只用于单个平台，ID 应来自当次 `charts` 结果。

默认匹配含“热歌”的榜单。某些平台使用其他名称（如“热门单曲”），应先 `charts`，再指定 `--chart`。名称匹配出现多个候选时脚本会要求选择，不会静默换成另一种榜单。`--limit` 为每个平台的条数（1–100）；榜内筛选最多检查本地服务第一页的 500 首，若被截断会有 `warnings`。

## TXQQ 搜索、下载与验证

```bash
# 网站搜索：保存搜索词、平台、页码、歌曲 ID 和真实返回的媒体链接
python3 ~/.codex/skills/music-search/scripts/txqq_music.py search 'we nevew' --source netease --output /tmp/txqq-search.json

# 下载选中的结果；重新按该歌曲 ID 解析，不依赖可能过期的旧 CDN 链接
python3 ~/.codex/skills/music-search/scripts/txqq_music.py download --receipt /tmp/txqq-search.json --index 1

# 单次完成搜索 → 选择 → 下载 → 本地音频验证，也可直接传用户给的搜索网址
python3 ~/.codex/skills/music-search/scripts/txqq_music.py fetch 'https://music.txqq.pro/?name=we%20nevew&type=netease' --index 1

# 热歌闭环：先保存真实榜单，再按该平台的原 ID 下载指定名次
python3 ~/.codex/skills/music-search/scripts/music_search.py hot --sources netease --limit 10 --output /tmp/hot-music.json
python3 ~/.codex/skills/music-search/scripts/txqq_music.py download --hot-receipt /tmp/hot-music.json --source netease --rank 2

# 已确认具体 ID 时可直接解析下载
python3 ~/.codex/skills/music-search/scripts/txqq_music.py download --source netease --id 3399022306
```

默认交付目录为 `~/Downloads/资讯/音乐下载/`，可用 `--outdir` 指定目录。`--index` 从 1 起，`--page` 选择搜索页。脚本每次下载一首；批量任务按用户指定的范围逐首执行并汇总每首状态。选择前核对歌曲名、歌手和版本，用户只要求搜索时运行 `search` 即可。

原站页面的搜索网址不是音频文件。已核验的页面版本为 v1.7.7，其 `static/js/music.js` 向首页发送表单 POST：`input=<关键词或ID>&filter=name|id&type=netease|qq|kuwo|...&page=1`，成功响应为 `code=200` 与 `data[]`，包含 `songid,title,author,url,link,type`。`txqq_music.py` 复现这个公开流程，并读取响应中的 `url`，按实际重定向保存；不拼造 CDN 或更改音频 URL 的付费/音质参数。网站平台代码以首页 radio 值为准，例如该站千千使用 `baidu`，Go Music DL 使用 `qianqian`，不能直接互传。热榜衔接示例已验证网易云。

下载依赖本机已有的 FFmpeg 与 ffprobe。脚本按 `FFMPEG` / `FFPROBE` 环境变量、PATH 和 `~/.local/share/go-music-dl/media-tools.json` 查找，配置记录了当前可用的本地路径；不需要重新安装工具。查询仍只用 Python 标准库。

成功文件必须经过媒体类型检查、ffprobe 探测、完整解码与 SHA-256 计算。可取得原平台时长时，按同平台 ID 核对时长；明显短于原曲的结果保留 `.part` 并返回失败。`duration_matches=null` 表示缺少原平台时长证据，只能说明本地文件可解码。不要把 HTTP 200、搜索结果、播放器时长或下载请求本身当作已交付音频。

同目录 `.receipts/<平台>-<歌曲ID>.json` 保存搜索/热榜来源、歌曲 ID、实际媒体地址、时长、格式、哈希和验证结果。含临时 CDN 地址的记录仅在本地以 0600 权限保存。成功后的再次下载会先核验已有文件并复用；已有 `.part` 或无匹配记录的同名成品会保留并报告，检查后再决定如何处理。HTTP 返回 HTML、链接失效或原曲不可下载时记录该首失败，不能静默替换为其他歌曲或版本。某首失败不影响其他明确选中歌曲的下载。

2026-10-30 实测：用户提供的搜索词 `we nevew` 返回《We Never (若如初见)》— YAYI、freezepain（网易云 ID `3399022306`），下载的 MP3 约 90.5 秒，与原平台约 90 秒相符。该站也可能对搜索成功的歌曲返回网页而非音频；本次网易云热歌榜第 1 首《我不难过》即如此，不能声称全站每首均可下载。

页面说明音频版权来自各网站、该站仅提供查询服务。响应未附逐曲授权文件；下载记录保留来源说明，音乐用途与授权证据分别记录。

## 回答与判断

- 回答“现在热门什么”时实际运行 `hot`；把“当前”限定为 `fetched_at` 的抓取时刻。这个时间不是歌曲发行日，也不保证平台已更新到当天。
- 显示平台、实际榜单名称、歌名、歌手和来源链接，必要时给出时长。`rank` 是该平台本次返回的榜单顺序；不合成没有依据的全网排名。跨平台重复出现可作为观察，不能直接声称全网热度最高。
- 搜索模式只有 `position`，不能把关键词搜索或标题含“热歌”的歌单称为官方热歌榜。
- 用户指定原唱时核对 `artist`；标题写着“原唱某某”的翻唱不能当作该歌手原版。本次“周杰伦 晴天”查询中，网易云返回了翻唱，酷我返回了周杰伦的原版与 Live 版，应据此区分。
- 检查整体 `status` 及每个来源的状态。`empty_or_unavailable` 表示原工具无法区分无结果和上游失败；`partial` 应说明哪些来源失败；`no_matches` 表示已取到歌曲但筛选未命中。不能把空数据描述为成功查到榜单。
- 默认不去重，以保留各平台版本和榜单证据；用户要求合并时按歌名、歌手与版本信息判断，保留各平台排名。时长明显不同的 Live/Remix/试听版应单列。
- 单纯搜索默认只查询元数据。用户明确要求下载时执行上述 TXQQ 流程；授权范围以当次请求为准。保留完整下载记录，交付时给出实际文件与验证结果。

## 运行与维护

脚本查找 `MUSIC_DL_BIN`、PATH 中的 `music-dl` 或 `~/.local/bin/music-dl`。本机安装记录：`~/.local/share/go-music-dl/installation.json`。已验证的官方发布为 [v1.1.3](https://github.com/guohuiyuan/go-music-dl/releases/tag/v1.1.3)，源码提交 `2c1cefe7064fba6e46034359791060debbc935e6`。

脚本在临时目录启动 `music-dl web --desktop --no-browser --port <临时端口>`；该版本的 `--desktop` 是隐藏参数，绑定 `127.0.0.1`。请求 `/music/toplists`、`/music/toplist_songs` 和 `/music/search`，从原生 HTML 的 `toplist-card` / `song-card` 读取数据并转换为 JSON。查询结束或失败后停止自己启动的进程并清理临时数据库；不读取用户 Cookie，不复用可能含待下载任务的既有服务，不打印服务启动日志。保留这些行为。

升级后若端点、隐藏参数或 HTML 属性改变，检查 [官方源代码](https://github.com/guohuiyuan/go-music-dl) 后调整脚本并重跑真实查询，不能把解析空结果当作兼容通过。单纯搜索不需要 Go、FFmpeg、浏览器或账号。
