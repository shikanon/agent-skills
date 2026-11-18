# 每次检查上游

检查这两个 GitHub 仓库的默认分支 HEAD：

- https://github.com/wangzhaobo168/wechat-channels-upload
- https://github.com/dreammis/social-auto-upload

upstreams.json 的 reviewed_commit 为已读码基线。publish.sh 的每次实际调用都会执行 git ls-remote --symref URL HEAD，不使用缓存跳过当次检查。结果包含 checked_at、reviewed_commit、remote_commit、has_update、status，失败 has_update 为 null。job 内保存 upstream-check.json；独立检查默认写 .publication-runtime/latest-upstream-check.json。

本地参考检出在 tools/wechat-channels-upload 与 tools/social-auto-upload。没有检出时按 URL clone；fetch 新提交后，对 reference_files 列出的上传脚本、环境和技能说明执行 git diff BASE NEW -- FILES。检查/下载不等于授权切换驱动、扩展平台或新投稿。

审阅选择器、登录、提交次数、排期和响应变化后适配本地模块，运行测试及必要的正常 UI 核验，再更新 reviewed_commit。无关变更可以记录并保留可用版本，不用 git pull 覆盖适配或台账。

本地辅助模块独立实现 Playwright 流程，没有执行上游安装器或 CLI。MIT 许可证在 upstream-licenses.txt，检出内也保留原件。
