# 输入与执行接口

设置 `SKILL_DIR` 为本技能目录、在工作目录执行。下文 PUBLISH 表示 `$SKILL_DIR/scripts/publish.sh`。可用 task_publish 变量保存这个路径，并使用 "$task_publish" 调用。

请求格式示例：替换文件、账号和未来时间后才可用于真实任务。

    {
      "platform": "wechat",
      "account": "creator",
      "expected_account": "用户指定的视频号名称",
      "items": [{
        "id": "lesson-01",
        "file": "/absolute/path/lesson.mp4",
        "short_title": "第一讲状态与动作",
        "title": "状态与动作怎样影响决策",
        "description": "本次已确认的完整正文和话题",
        "mode": "scheduled",
        "publish_at": "2026-11-01T12:00:00+08:00",
        "collection": "用户选择的现有合集",
        "original": true,
        "ai": true
      }]
    }

抖音 platform 为 douyin，title 最长 30 字，short_title 不需要。description 包含完整话题，不由脚本再追加第二份。original、ai、cover、collection、download_allowed 只在本轮需要时提供。立即发布必须 mode: immediate 且不带 publish_at。可提供 sha256 让 plan 校验；封面也记录真实哈希。

    PUBLISH plan --request /absolute/request.json --job .publication-runtime/jobs/job-name
    PUBLISH session --job .publication-runtime/jobs/job-name

session 持续运行，不依赖终端 stdin。磁盘 RPC 避免长命令被 PTY 截断。用其他命令提交操作：

    PUBLISH call --job JOB --action snapshot
    PUBLISH result --job JOB --id 返回的UUID

call 立即返回 UUID，result 返回 queued/running/complete/failed。上传慢或工具超时时只轮询原 UUID，不能重发同一个发布动作。错误截图和不确定状态都会保留。长操作期间保持简短沟通，不阻塞等待超过一分钟。

固定配方：

    PUBLISH call --job JOB --action script \
      --script $SKILL_DIR/scripts/run-item.cjs \
      --params '{"phase":"inventory"}'

prepare、submit、verify 用同一入口，params 例如 {"phase":"prepare","id":"lesson-01"}。动作分开为了保存恢复点，不是要求每一步重新申请用户确认；当前已授权上传时可连续执行。

需要按实际 DOM 适配账号核验、封面、清单或时间控件时，在 JOB 写 CommonJS 模块，并通过 --action script --script JOB/adapt.cjs 调用：

    module.exports = async ({page, context, jobDir, core, adapter, observations, params}) => {
      return core.snapshot(page, require('node:path').join(jobDir, 'inspection'));
    };

模块可用 core.verifyRecord(jobDir, id, actualRecord, evidenceFile) 保存平台核验。actualRecord 字段为 object_id、title、description、publish_at，可选 file_size、width、height、duration。视频号 title 对应短标题，抖音对应作品标题。时刻必须来自平台读回；接口缺字段时打开该已保存稿件的原生编辑页读取，并把实际观察写入 evidenceFile，不能从计划复制。多次网络响应里的同一 ID 应去重，不同 ID 的重复正文要核对。

台账 uploading 表示文件传送可能已开始；即使表单准备失败，也先检查原会话和草稿，不直接重新上传。未知提交先用独立只读管理页核对，保留已传文件。只有确认未受理且原因已定位后，才能写针对性恢复脚本，保留原 attempt 和排查证据；不能仅为绕过保护而重置状态、重新上传。修改已定时作品优先编辑现有稿件。

    PUBLISH call --job JOB --action close

运行时自动寻找 PATH 中或 Codex 自带的 Node/Playwright。可用 MEDIA_NODE_BIN、MEDIA_PLAYWRIGHT_MODULE、MEDIA_CHROMIUM_EXECUTABLE 指定已有运行时。默认有头浏览器、Asia/Shanghai。允许 raw CDP 和现有 Chrome cookies 的读取、导出、复制及导入，具体见 existing-browser.md；不要将密码、验证码、cookies、完整签名媒体 URL 写入请求、日志或 Git。

验证命令（Node 不在 PATH 时使用上述 MEDIA_NODE_BIN 路径）：

    node --test $SKILL_DIR/scripts/test-publisher.cjs

该测试只使用临时文件、测试替身和本地浏览器页面，不会上传到真实平台。
