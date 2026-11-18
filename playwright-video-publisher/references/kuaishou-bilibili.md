# 快手与 B站

使用 `platform: kuaishou` 或 `bilibili`；每个 job 仅一条，使用 `run-item.cjs` 的 prepare、submit、verify 三步。必须明确指定定时、封面和 `ai: true`；快手还必须设置 `download_allowed: false`，B站下载控制尚不支持、必须省略此字段，B站封面需为 PNG，还需 `original: true` 和非空 `tags`，其适配器当前仅支持人工智能分区、禁止转载且不处理合集。快手原创声明暂不支持，需提供 `collection`，或者明确 `collection_pending: true`。不符合的需求停止并在 job 中扩展适配，不修改用户意图。

这两个适配器来自本项目历史流程并参考 social-auto-upload；上游快手有自动重复点击，本地不采用。B站上游使用 biliup，本技能保留 Playwright，不执行 biliup 安装或 CLI。提交前需要检查平台账号、全文、定时、封面真实预览及必要控件；审核、定时与公开分别记录。遇到验证码、额度、身份不符、选择器变化、未知结果立即停止。平台布局改变时先保留证据并在 job 内适配，不能通过切会话或重复点击绕过。

现有离线测试不代表当前平台的真实投稿已成功，且快手封面编辑后曾出现保存但读回旧图，必须重新打开核实。B站投稿完成后按原生响应 aid/bvid 和管理页核验；快手按原生 publishId、全文与定时核验。
