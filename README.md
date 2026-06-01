# 云开发 quickstart

这是云开发的快速启动指引，其中演示了如何上手使用云开发的三大基础能力：

- 数据库：一个既可在小程序前端操作，也能在云函数中读写的 JSON 文档型数据库
- 文件存储：在小程序前端直接上传/下载云端文件，在云开发控制台可视化管理
- 云函数：在云端运行的代码，微信私有协议天然鉴权，开发者只需编写业务逻辑代码

## 参考文档

- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

## Local-First Data Model

GlowRoutine treats local storage as the primary persistence layer. Cloud Development is an enhancement for photo retention, AI processing, report archive, and future cross-device sync.

### Local Storage Keys

- `skin_profile`: current skin profile.
- `has_skin_profile`: compatibility flag used by existing routing.
- `skincare_cabinet`: local skincare cabinet products.
- `skin_diary_logs`: local diary and routine check-in records.
- `routine_preferences`: local routine preferences and UI state.
- `ai_report_cache`: cached AI reports and local fallback reports.
- `entitlement_state`: current plan state, default `{ "plan": "free" }`.
- `entitlement_usage`: calendar-month AI usage counters.

### Default Free Quotas

- Cloud photo retention: latest 6 cloud photos.
- AI OCR: 3 uses per month.
- Buying consultation: 5 uses per month.
- AI report archive: latest 2 reports.

### Default Member Quotas

- Cloud photo retention: latest 120 cloud photos.
- AI OCR: 60 uses per month.
- Buying consultation: 100 uses per month.
- AI report archive: latest 36 reports.

### Verification

Run utility tests:

```bash
node miniprogram/utils/localData.test.js
node miniprogram/utils/entitlementRules.test.js
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
```

Run cloud function syntax checks:

```bash
node -c cloudfunctions/skinDiaryAnalysis/index.js
node -c cloudfunctions/buyingConsultation/index.js
```

Manual checks in WeChat DevTools:

- Disable cloud/network and create a skin profile.
- Add, edit, and delete one skincare cabinet product.
- Save a diary with text and scores while photo upload is unavailable.
- Generate a weekly report while cloud function calls fail.
- Exhaust free buying consultation quota and confirm local fallback appears.
