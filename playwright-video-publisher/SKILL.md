---
name: playwright-video-publisher
description: 在 media 项目用独立 Playwright 上传视频号、抖音、快手或B站视频、设置平台原生定时、核验既有投稿。每次使用先检查两个 GitHub 上游仓库更新。适用于上传、续传、查重与发布排期，不负责生成视频或创建长期定时任务。
---

# 多平台 Playwright 视频发布

使用 Node.js Playwright，优先复用用户已有的本人平台登录态。允许使用 raw CDP、Playwright connectOverCDP，以及读取、导出或复制现有 Chrome cookies；可将所需平台的 cookies 导入发布专用 context。不要调用 browser use、CUA 或浏览器插件。登录复用配方见 [existing-browser.md](references/existing-browser.md)。Cookies 属于凭据，仅在本机受保护文件或内存中处理，不写入源码、文档、请求台账、日志或版本库。封装或测试技能不等于授权真实投稿；用户本轮已经要求上传/发布时直接完成，无需再要求确认。

## 每次使用先查 GitHub

设置技能目录后执行（下文简称 PUBLISH）：

    "$SKILL_DIR/scripts/publish.sh" check-upstream

所有实际命令都会用 git ls-remote 查询两个上游的当前默认分支 HEAD，比较 upstreams.json 的已审阅提交，并保存带时间的结果。一个会话内的多条视频属于同一次使用，不需每条重开浏览器。

- update_available：审阅上传文件差异，再决定是否适配本地脚本；不能直接覆盖已验证流程或执行新下载代码。审阅和测试后才改 reviewed_commit。
- check_failed：更新状态未知，不能说没有更新。可以继续使用已有固定版本，但保留失败记录，不无限重试。
- 来源与更新流程见 [upstreams.md](references/upstreams.md)。抖音上游当前使用 Patchright，本技能保留用户要求的 Playwright，只参考页面流程和选择器。

## 输入和执行

先读 [workflow.md](references/workflow.md)，用本轮实际视频、独立平台文案、账号、合集和时刻生成 request.json，再用 plan 建立独立 job。plan 不打开浏览器、不上传、不发布，不覆盖旧台账。相对视频路径基于请求文件目录解析。

提交前按平台实际比例适配封面，检查标题、主体、裁切及原生预览和质量提示；横竖封面分别处理，另存适配版本，记录结果，不修改源视频。

定时必须有带时区的未来时间。发布窗口、间隔、合集和下载设置遵循本轮要求及项目约定；不要把某一批 16 条、固定窗口或账号名写成通用默认。mode 必须明确，定时失败不降级为立即发布。

1. 优先通过既有 CDP 会话或现有 Chrome cookies 复用登录，再启动 session，snapshot 检查本人账号并保存账号核验截图。既有登录不可用时展示实际二维码并等用户正常登录。验证码、限额和实际访问拒绝均保留证据，停在当前步骤。
2. 按平台读 [wechat.md](references/wechat.md)、[douyin.md](references/douyin.md) 或 [kuaishou-bilibili.md](references/kuaishou-bilibili.md)。通过原生管理页查公开、定时、审核中和草稿，结合源文件 SHA256 与旧台账查重。“第一页没看到”不证明不存在。
3. 用 run-item.cjs 的 prepare 填一条，核对实际上传、服务端处理完成、全文、发布模式和本轮要求的设置。先验证一条完整流程，再顺序处理其余已授权稿件。短标题框出现不代表上传完成；不强点灰色按钮、删除提示浮层或吞掉必需项错误。
4. submit 点击前持久化 submission_unknown，并只点击一次。成功响应只能记 accepted_unverified。verify 从管理页或已保存编辑页读回唯一作品 ID、全文和原生排期后，才能记 verified。
5. submission_unknown / accepted_unverified 必须先核对平台与原 RPC 结果，不能直接重传或再点发布。DOM/响应变化时在 job 内写 Playwright 适配模块，使用同一会话续做；不要换 browser use。不要从计划补造平台证明字段。
6. 最后刷新管理页逐条核对，保存排期和回执，更新该项目的既有记录。上传受理、审核、定时和公开播放分别记录。自己的独立 context 可通过 context.close() 释放；共享用户 Chrome 时仅断开本次连接，不关闭用户浏览器或标签页。

profile 在仓库外，job 台账与截图在工作目录的 .publication-runtime/jobs/。使用 --profile 显式指定已有的私有登录目录。

## 验证边界

快手、B站适配器从 2026-10-29 已验证的投稿流程抽取并泛化，跨账号/当前页面尚未真实投稿验收；上线前必须完成独立 UI 核验。视频号流程源自 2026-10-16 真实 16 条上传和排期核验，证据在 media/publication/wechat-channels-20261016/。抖音流程参考固定版本上游；本地模拟浏览器通过不等于新增真实抖音投稿。首次真实使用先验证一条，不把其他方式的历史投稿当成本配方在线验收。

修改脚本后运行 scripts/test-publisher.cjs 的 Node 测试，并用 skill-creator 的 quick_validate.py 检查技能结构。运行时定位和确切命令见 workflow.md。
