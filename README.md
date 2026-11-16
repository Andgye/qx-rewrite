# qx-rewrite

个人使用的 Quantumult X 重写与本地任务脚本。

## 电信营业厅

### 文件

- `telecom.conf`：远程重写订阅，自动捕获电信登录态。
- `telecom_capture.js`：被重写订阅引用，不直接加入本地任务。
- `qx_telecom_daily.js`：下载到 Quantumult X 本地脚本，作为定时任务运行。
- `tests/telecom.test.js`：活动编排、加密和圈 X 入口测试。

### 使用

1. 在圈 X 的远程重写中订阅：

   ```text
   https://raw.githubusercontent.com/Andgye/qx-rewrite/main/telecom.conf
   ```

2. 确认 MITM 证书已安装并信任，重写开关已开启。

3. 打开电信营业厅，进入金豆活动、宠物或翼播客页面，收到“登录态已抓取”后停止浏览。

4. 将 `qx_telecom_daily.js` 下载到圈 X 本地脚本，然后添加任务：

   ```text
   10 13 * * * qx_telecom_daily.js, tag=电信营业厅活动, enabled=true
   ```

### 活动范围

脚本包含以下流程：

- 每日金豆签到、余额与到期提醒
- 连签 15/28 天抽奖
- 首页任务、领奖、消息、分享和聚合任务
- 翼播客直播、短视频与直播间点赞
- 宠物喂食、等级/成长展示与权益兑换
- 每月见面礼、视频抽奖次数和 App 抽奖
- 金豆商城登录、转盘活动查询与抽奖

消耗金豆的宠物权益和商城转盘已实现，但 `ALLOW_BEAN_SPENDING` 默认关闭，避免自动消费。需要启用时，把 `qx_telecom_daily.js` 顶部 `defaultConfig` 中的该值改成 `true`。

### 失效处理

脚本遇到 401、403、412 或 WAF 页面会停止当前流程，并提示重新打开电信营业厅抓取登录态。登录态只保存在圈 X 本地 `$prefs`，抓取脚本不会保存服务密码。

### 测试

```bash
node --check qx_telecom_daily.js
node --check telecom_capture.js
node --test tests/telecom.test.js
```
