# 视频号配方

来源：wangzhaobo168/wechat-channels-upload，固定提交见 upstreams.json。原生入口为 channels.weixin.qq.com/platform/post/create 和 /platform/post/list。

当前字段：input[accept*="video"]、input[placeholder*="短标题"]、div.input-editor、定时/不定时 radio、请选择发表时间日期框、请选择时间输入框、原创协议和含AI生成内容。正文输入后 trimEnd 逐字核对，避免空简介或重复正文。

服务端就绪信号是正常 UI 的 /post/post_clip_video_result 响应含 duration/width/height。取消上传消失、本地预览可播或标题框出现都不单独证明服务端处理完成。发表还需不是 disabled。

定时用原生日历，先日期后时间，Tab/标签点击失焦后读回 YYYY-MM-DD HH:mm。跨月箭头变化时检查实际 DOM 并适配 setSchedule，完整日期读回仍必需。时刻不可用时在用户发布窗口内选未来时刻，不能降级立即发表。

原创需完成实际协议；不自动加入新的创作分成计划。指定封面必须等待预览和生成结束，失败不能静默换默认图。AI 标注做表单核对；定时稿件若未回显，不把点击过说成公开视频标签已验证。

提交观察 /post/post_create errCode，再从原生 /post/post_list 读 objectId、desc.shortTitle、desc.description、effectiveTime、originalInfo.isDeclared 和 media 的时长/尺寸/大小。effectiveTime 是 Unix 秒，createTime 是创建时间。只保存选定证明字段，不存 objectNonce、签名 URL 或完整响应。

真实历史证据（不会自动变成新任务）：


该批 16 条的唯一作品 ID、全文、原生排期、文件大小和尺寸/时长均通过核验。批次、账号及窗口仅属当次内容。
