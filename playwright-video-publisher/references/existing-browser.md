# 复用已登录 Chrome

优先复用用户现有的本人平台登录态。允许独立脚本使用 raw CDP、Playwright connectOverCDP，以及读取、导出或复制现有 Chrome cookies；不调用 browser use/CUA/浏览器插件。

Chrome 144+ 可由用户在 `chrome://inspect/#remote-debugging` 启用连接并确认连接请求，无须重启。Playwright 1.62 支持 `chromium.connectOverCDP('chrome', {noDefaults:true})`，从本机 DevToolsActivePort 定位入口。可复用既有本机调试端点，也可用 raw CDP 读取所需平台的登录 cookies，再通过 context.addCookies 导入发布 context。不要操作与发布无关的标签页。

没有调试入口时，可读取用户指定或当前 Chrome profile 中所需发布平台的 cookies。直接读取正在使用的数据库时采用只读连接或一致性快照，不修改原数据库。加密 cookies 使用本机正常可用的密钥链解密方式；系统要求本人解锁时由用户正常完成，不绕过系统保护。导入时保留 domain、path、expires、secure、httpOnly、sameSite 等实际属性；不要拼造登录值。只处理目标平台及必要登录域。

Cookie 导出文件放在仓库外的私有运行目录，目录权限 0700、文件权限 0600。不要输出 cookie 值、解密密钥或完整 storage state，也不要写入截图说明、RPC 回执、发布台账或 Git。临时快照、解密件与导出件使用完删除；发布专用 profile 可保留正常登录态。导入成功后从原生页面核对本人账号和登录状态，导入本身不证明已登录。

`scripts/existing-browser.cjs` 提供 connectExisting(chromium, endpoint='chrome')，返回 browser、context、disconnect。只接受本机端点；连接前仍检查两个 GitHub 上游。

先列出发布平台已有标签页并核对本人账号，再复用对应页。不要操作无关标签、清理共享 storage 或修改全局时区/权限。排期依据平台实际北京时间控件。结束调用 disconnect，只断开本次连接；绝不 context.close 或关用户标签。首次调整后，用临时浏览器验证 disconnect 保留原浏览器及页面。

发布仍遵循单次提交、未知状态先核对、平台读回 ID/全文/排期的原流程。连接方式变化不解除验证码、访问拒绝等平台限制。existing-browser.cjs 目前封装的是 Playwright 连接方式；raw CDP 与本机 cookies 读取按实际环境编写适配，不把说明文档当作已实现或已通过线上验证。
