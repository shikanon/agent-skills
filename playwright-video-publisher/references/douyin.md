# 抖音配方

参考 dreammis/social-auto-upload 的 uploader/douyin_uploader/main.py，版本见 upstreams.json。当前上游使用 Patchright，本技能保留普通 Playwright。允许按 existing-browser.md 使用 raw CDP 或现有 Chrome cookies 复用登录；既有上传适配器没有内置这些登录读取功能。不复制 stealth、强点或循环提交。

入口 creator.douyin.com/creator-micro/content/upload，上传后可能是 /content/publish 或 /content/post/video，管理页 /content/manage。URL 不单独证明已登录；核对实际登录控件和本人账号。首次在独立 profile 扫码，短信由用户正常完成。

- 标题 input[placeholder*="填写作品标题"]，超过 30 字先改文案，不静默截断。
- 正文 div.zone-container[contenteditable="true"]，先清空再输入唯一全文。Escape 收起话题联想，重新读回，拒绝联想替换和重复段落。
- 上传就绪是 long-card 区出现重新上传，再检查处理、封面与发布按钮。
- 合集 select-collection 内 semi-select-selection；选项 semi-select-option.collection-option，精确选名称。本次要求的合集不能吞错跳过。
- 定时是 radio 的定时发布和 placeholder 为日期和时间的 Semi 输入。填写北京时间，Enter/Tab 后读回并确认可见，避免实际仍为立即发布。
- AI 是自主声明 → 请选择声明类型 → 内容由AI生成 → 确定，仅按实际内容设置。
- 下载/原创控制依账号变化；要求的控制不可用时保留证据并定位，不能声称已设置。

只点击一次发布，观察原生请求的 status_code/errCode/code。识别不到回执或等待超时先查管理页，不能直接再点。验证码、限额和封面失败时保存状态，不自动重试、不删除提示层。

inventory 收集正常管理页响应里的 aweme_id/item_id、正文和 schedule_time 等已知字段，同时保存截图。只覆盖可见第一页；不同版本可能不给完整标题或原生时刻。需筛选、翻页，并可重新打开已保存编辑页读实际控件。唯一 ID、正文和时刻都有实际证据后才 verifyRecord；缺字段不是空库存，不能从计划补造证明。

封装验收没有新增真实抖音投稿。项目过去的抖音投稿来自另一种界面操作，不证明本配方线上通过。首次真实使用先验证一条完整流程，再处理其余已授权稿件。
