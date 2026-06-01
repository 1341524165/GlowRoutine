# Local-First Cloud Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GlowRoutine 从云优先改为本地优先架构，让肤况档案、护肤柜、日常 routine 和文字日记离线可用，云端能力只作为会员、配额和同步增强。

**Architecture:** 新增 `localData` 作为唯一的本地持久化入口，新增 `entitlementRules` 统一管理会员状态、免费配额和阈值提示，新增 `cloudEnhancements` 封装所有可失败的云能力。页面先读写本地，再按资格异步调用云端；云失败只写同步状态，不阻塞核心流程。

**Tech Stack:** Native WeChat Mini Program, WeChat Cloudbase, Node.js standalone utility tests, wx storage APIs, existing cloud functions.

---

## File Structure

- Create: `miniprogram/utils/localData.js` - 统一封装 `wx.getStorageSync` / `wx.setStorageSync`，保留现有 key 并提供实体级 CRUD、最新写入合并、AI 报告缓存。
- Create: `miniprogram/utils/localData.test.js` - 用 mock `wx` 验证旧 key 可读、本地写入、latest-write-wins 合并、报告归档裁剪。
- Create: `miniprogram/utils/entitlementRules.js` - 定义免费/会员配额、月度用量、云照片保留、提示状态和云能力准入。
- Create: `miniprogram/utils/entitlementRules.test.js` - 验证免费阈值、会员阈值、月度重置、near/at limit 提示。
- Create: `miniprogram/utils/cloudEnhancements.js` - 封装云数据库、云存储、云函数调用，返回 `{ ok, data, error }`，禁止页面直接处理致命云异常。
- Create: `miniprogram/utils/cloudEnhancements.test.js` - 验证无 `wx.cloud`、上传失败、云函数失败时返回非抛错结果。
- Create: `miniprogram/utils/reportFallback.js` - 生成离线周报与购买咨询失败兜底文案，避免空白 UI。
- Create: `miniprogram/utils/reportFallback.test.js` - 验证周报和购买咨询 fallback 字段完整且不含医疗诊断承诺。
- Modify: `miniprogram/pages/questionnaire/questionnaire.js` - 肤况档案本地保存为主，云同步变成后台增强。
- Modify: `miniprogram/pages/index/index.js` - routine 页面只从本地数据层读核心数据，云 merge 异步回写本地。
- Modify: `miniprogram/pages/cabinet/cabinet.js` - 护肤柜列表从 `localData` 读取；删除先本地后云端。
- Modify: `miniprogram/pages/cabinet/add.js` - 新增/编辑产品先写本地；OCR 前走 AI 配额检查。
- Modify: `miniprogram/pages/diary/diary.js` - 日记保存先落本地；照片上传失败不丢日记；免费云照片保留自动裁剪元数据；AI 周报使用缓存/规则 fallback。
- Modify: `miniprogram/pages/buying/buying.js` - 购买咨询先走配额；云失败展示规则 fallback 并缓存最近结果。
- Modify: `cloudfunctions/skinDiaryAnalysis/index.js` - 云函数异常返回友好 fallback 数据结构而不是 `success:false` 空结果。
- Modify: `cloudfunctions/buyingConsultation/index.js` - 云函数异常返回友好 fallback 数据结构而不是只返回错误。
- Modify: `README.md` - 记录本地优先数据 key、配额默认值、测试命令和云能力边界。

## Chosen Initial Quotas

- Free cloud photo retention: latest 6 cloud photos.
- Free AI OCR: 3 uses per calendar month.
- Free buying consultation: 5 uses per calendar month.
- Free AI report archive: latest 2 reports.
- Member cloud photo retention: latest 120 cloud photos.
- Member AI OCR: 60 uses per calendar month.
- Member buying consultation: 100 uses per calendar month.
- Member AI report archive: latest 36 reports.

## Task 1: Local Data Service

**Files:**
- Create: `miniprogram/utils/localData.js`
- Create: `miniprogram/utils/localData.test.js`

- [ ] **Step 1: Write the failing local data tests**

Create `miniprogram/utils/localData.test.js`:

```javascript
const localData = require('./localData');

const store = {};
global.wx = {
  getStorageSync(key) {
    return store[key];
  },
  setStorageSync(key, value) {
    store[key] = value;
  },
  removeStorageSync(key) {
    delete store[key];
  }
};

function resetStore() {
  Object.keys(store).forEach(key => delete store[key]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testSkinProfileUsesExistingKeys() {
  resetStore();
  const profile = { skin_type: 'dry', sensitivity: 'stable', goals: ['hydrate'] };
  localData.saveSkinProfile(profile);
  assert(store.skin_profile.skin_type === 'dry', 'skin_profile should be saved');
  assert(store.has_skin_profile === true, 'has_skin_profile should remain readable');
  assert(localData.getSkinProfile().goals[0] === 'hydrate', 'profile should round-trip');
}

function testCabinetUpsertAndDelete() {
  resetStore();
  const product = localData.upsertCabinetProduct({
    product_name: 'B5 Cream',
    category: 'cream',
    opened_date: '2026-06-01',
    pao_months: 6,
    ingredients: ['B5']
  });
  assert(product._id.startsWith('local_'), 'local products should receive local ids');
  assert(product.sync_status === 'local_only', 'new local products should start local_only');
  assert(localData.getCabinetProducts().length === 1, 'cabinet should contain product');
  localData.upsertCabinetProduct({ ...product, product_name: 'B5 Cream Updated', synced_at: '2026-06-01T01:00:00.000Z' });
  assert(localData.getCabinetProducts()[0].product_name === 'B5 Cream Updated', 'upsert should update same product');
  localData.deleteCabinetProduct(product._id);
  assert(localData.getCabinetProducts().length === 0, 'delete should remove product');
}

function testDiaryLocalFirstShape() {
  resetStore();
  const diary = localData.addSkinDiary({
    date: '2026-06-01',
    ratings: { oiliness: 4, redness: 1, acne: 1, peeling: 1 },
    statuses: [],
    triggers: ['stay_up'],
    local_photo_path: 'tmp/photo.jpg'
  });
  assert(diary._id.startsWith('local_'), 'diary should receive local id');
  assert(diary.photo_sync_status === 'pending', 'local photo should be pending sync');
  assert(localData.getSkinDiaries()[0]._id === diary._id, 'diary should be stored newest first');
}

function testLatestWriteWinsMerge() {
  resetStore();
  localData.upsertCabinetProduct({ _id: 'p1', product_name: 'Old', updated_at: '2026-06-01T01:00:00.000Z' });
  localData.mergeCabinetProducts([{ _id: 'p1', product_name: 'New', updated_at: '2026-06-01T02:00:00.000Z' }]);
  assert(localData.getCabinetProducts()[0].product_name === 'New', 'newer cloud item should win');
  localData.mergeCabinetProducts([{ _id: 'p1', product_name: 'Stale', updated_at: '2026-06-01T00:00:00.000Z' }]);
  assert(localData.getCabinetProducts()[0].product_name === 'New', 'older cloud item should not overwrite');
}

function testReportArchiveLimit() {
  resetStore();
  localData.saveAiReport({ id: 'r1', type: 'weekly', created_at: '2026-06-01T00:00:00.000Z' }, 2);
  localData.saveAiReport({ id: 'r2', type: 'weekly', created_at: '2026-06-02T00:00:00.000Z' }, 2);
  localData.saveAiReport({ id: 'r3', type: 'weekly', created_at: '2026-06-03T00:00:00.000Z' }, 2);
  const reports = localData.getAiReports();
  assert(reports.length === 2, 'archive should be trimmed to limit');
  assert(reports[0].id === 'r3' && reports[1].id === 'r2', 'newest reports should be retained');
}

testSkinProfileUsesExistingKeys();
testCabinetUpsertAndDelete();
testDiaryLocalFirstShape();
testLatestWriteWinsMerge();
testReportArchiveLimit();
console.log('localData tests passed');
```

- [ ] **Step 2: Run the local data tests and verify they fail**

Run: `node miniprogram/utils/localData.test.js`

Expected: FAIL with `Cannot find module './localData'`.

- [ ] **Step 3: Implement the local data service**

Create `miniprogram/utils/localData.js`:

```javascript
const STORAGE_KEYS = {
  skinProfile: 'skin_profile',
  hasSkinProfile: 'has_skin_profile',
  cabinet: 'skincare_cabinet',
  diaries: 'skin_diary_logs',
  routinePreferences: 'routine_preferences',
  aiReports: 'ai_report_cache',
  entitlement: 'entitlement_state',
  usage: 'entitlement_usage'
};

function nowIso() {
  return new Date().toISOString();
}

function makeLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function setStorage(key, value) {
  wx.setStorageSync(key, value);
  return value;
}

function normalizeTime(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function newerOf(a, b) {
  const aTime = normalizeTime(a.updated_at || a.synced_at || a.created_at);
  const bTime = normalizeTime(b.updated_at || b.synced_at || b.created_at);
  return bTime >= aTime ? b : a;
}

function saveSkinProfile(profile) {
  const saved = {
    ...profile,
    updated_at: profile.updated_at || nowIso(),
    sync_status: profile.sync_status || 'local_only'
  };
  setStorage(STORAGE_KEYS.skinProfile, saved);
  setStorage(STORAGE_KEYS.hasSkinProfile, true);
  return saved;
}

function getSkinProfile() {
  return getStorage(STORAGE_KEYS.skinProfile, null);
}

function getCabinetProducts() {
  return getStorage(STORAGE_KEYS.cabinet, []);
}

function saveCabinetProducts(products) {
  return setStorage(STORAGE_KEYS.cabinet, products);
}

function upsertCabinetProduct(product) {
  const products = getCabinetProducts();
  const saved = {
    ...product,
    _id: product._id || makeLocalId('local_product'),
    status: product.status || 'opened',
    created_at: product.created_at || nowIso(),
    updated_at: nowIso(),
    sync_status: product.sync_status || 'local_only'
  };
  const index = products.findIndex(item => item._id === saved._id);
  if (index >= 0) {
    products[index] = { ...products[index], ...saved };
  } else {
    products.push(saved);
  }
  saveCabinetProducts(products);
  return saved;
}

function mergeCabinetProducts(incoming) {
  const byId = {};
  getCabinetProducts().forEach(item => {
    byId[item._id] = item;
  });
  incoming.forEach(item => {
    if (!item._id) return;
    const normalized = { ...item, sync_status: 'synced', synced_at: item.synced_at || nowIso() };
    byId[item._id] = byId[item._id] ? newerOf(byId[item._id], normalized) : normalized;
  });
  const merged = Object.keys(byId).map(key => byId[key]);
  saveCabinetProducts(merged);
  return merged;
}

function deleteCabinetProduct(id) {
  const products = getCabinetProducts().filter(item => item._id !== id);
  saveCabinetProducts(products);
  return products;
}

function getSkinDiaries() {
  return getStorage(STORAGE_KEYS.diaries, []);
}

function saveSkinDiaries(diaries) {
  return setStorage(STORAGE_KEYS.diaries, diaries);
}

function addSkinDiary(diary) {
  const saved = {
    ...diary,
    _id: diary._id || makeLocalId('local_diary'),
    created_at: diary.created_at || nowIso(),
    updated_at: nowIso(),
    sync_status: diary.sync_status || 'local_only',
    photo_sync_status: diary.local_photo_path || diary.photo_path ? (diary.cloud_file_id ? 'synced' : 'pending') : 'none'
  };
  const diaries = getSkinDiaries();
  diaries.unshift(saved);
  saveSkinDiaries(diaries);
  return saved;
}

function updateSkinDiary(id, patch) {
  const diaries = getSkinDiaries().map(item => {
    if (item._id !== id) return item;
    return { ...item, ...patch, updated_at: nowIso() };
  });
  saveSkinDiaries(diaries);
  return diaries.find(item => item._id === id);
}

function mergeSkinDiaries(incoming) {
  const byId = {};
  getSkinDiaries().forEach(item => {
    byId[item._id] = item;
  });
  incoming.forEach(item => {
    if (!item._id) return;
    const normalized = { ...item, sync_status: 'synced', synced_at: item.synced_at || nowIso() };
    byId[item._id] = byId[item._id] ? newerOf(byId[item._id], normalized) : normalized;
  });
  const merged = Object.keys(byId)
    .map(key => byId[key])
    .sort((a, b) => normalizeTime(b.created_at) - normalizeTime(a.created_at));
  saveSkinDiaries(merged);
  return merged;
}

function getRoutinePreferences() {
  return getStorage(STORAGE_KEYS.routinePreferences, {});
}

function saveRoutinePreferences(preferences) {
  return setStorage(STORAGE_KEYS.routinePreferences, { ...preferences, updated_at: nowIso() });
}

function getAiReports() {
  return getStorage(STORAGE_KEYS.aiReports, []);
}

function saveAiReport(report, limit) {
  const saved = {
    ...report,
    id: report.id || makeLocalId('local_report'),
    created_at: report.created_at || nowIso()
  };
  const reports = [saved, ...getAiReports().filter(item => item.id !== saved.id)]
    .sort((a, b) => normalizeTime(b.created_at) - normalizeTime(a.created_at))
    .slice(0, limit);
  setStorage(STORAGE_KEYS.aiReports, reports);
  setStorage('last_weekly_report', saved.data || saved);
  setStorage('last_report_time', saved.created_at);
  setStorage('report_unlocked', true);
  return saved;
}

function getEntitlementState() {
  return getStorage(STORAGE_KEYS.entitlement, { plan: 'free', updated_at: nowIso() });
}

function saveEntitlementState(state) {
  return setStorage(STORAGE_KEYS.entitlement, { plan: 'free', ...state, updated_at: nowIso() });
}

function getUsageState() {
  return getStorage(STORAGE_KEYS.usage, {});
}

function saveUsageState(usage) {
  return setStorage(STORAGE_KEYS.usage, usage);
}

module.exports = {
  STORAGE_KEYS,
  saveSkinProfile,
  getSkinProfile,
  getCabinetProducts,
  saveCabinetProducts,
  upsertCabinetProduct,
  mergeCabinetProducts,
  deleteCabinetProduct,
  getSkinDiaries,
  saveSkinDiaries,
  addSkinDiary,
  updateSkinDiary,
  mergeSkinDiaries,
  getRoutinePreferences,
  saveRoutinePreferences,
  getAiReports,
  saveAiReport,
  getEntitlementState,
  saveEntitlementState,
  getUsageState,
  saveUsageState
};
```

- [ ] **Step 4: Run the local data tests and verify they pass**

Run: `node miniprogram/utils/localData.test.js`

Expected: PASS with `localData tests passed`.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/localData.js miniprogram/utils/localData.test.js
git commit -m "feat: add local-first data service"
```

## Task 2: Entitlement And Threshold Rules

**Files:**
- Create: `miniprogram/utils/entitlementRules.js`
- Create: `miniprogram/utils/entitlementRules.test.js`

- [ ] **Step 1: Write the failing entitlement tests**

Create `miniprogram/utils/entitlementRules.test.js`:

```javascript
const rules = require('./entitlementRules');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testFreeQuotaAllowsUntilLimit() {
  const state = { plan: 'free' };
  const usage = { '2026-06': { ai_ocr: 2 } };
  const result = rules.canUseCloudFeature('ai_ocr', state, usage, new Date('2026-06-15T00:00:00Z'));
  assert(result.allowed === true, 'free user should be allowed below OCR quota');
  assert(result.remaining === 1, 'remaining OCR quota should be 1');
}

function testFreeQuotaBlocksAtLimit() {
  const result = rules.canUseCloudFeature('buying_consultation', { plan: 'free' }, { '2026-06': { buying_consultation: 5 } }, new Date('2026-06-15T00:00:00Z'));
  assert(result.allowed === false, 'free user should be blocked at buying quota');
  assert(result.prompt.level === 'at_threshold', 'blocked quota should produce at_threshold prompt');
}

function testMemberQuotaIsHigher() {
  const result = rules.canUseCloudFeature('buying_consultation', { plan: 'member' }, { '2026-06': { buying_consultation: 50 } }, new Date('2026-06-15T00:00:00Z'));
  assert(result.allowed === true, 'member should be allowed at 50 buying consultations');
  assert(result.limit === 100, 'member buying quota should be 100');
}

function testMonthUsageReset() {
  const usage = rules.incrementUsage({}, 'ai_ocr', new Date('2026-06-15T00:00:00Z'));
  const next = rules.incrementUsage(usage, 'ai_ocr', new Date('2026-07-01T00:00:00Z'));
  assert(next['2026-06'].ai_ocr === 1, 'June count should remain');
  assert(next['2026-07'].ai_ocr === 1, 'July count should start fresh');
}

function testPhotoRetention() {
  const free = rules.getCloudPhotoRetention({ plan: 'free' });
  const member = rules.getCloudPhotoRetention({ plan: 'member' });
  assert(free === 6, 'free photo retention should be 6');
  assert(member === 120, 'member photo retention should be 120');
}

function testNearThresholdPrompt() {
  const prompt = rules.getThresholdPrompt('cloud_photo_retention', 5, 6, { plan: 'free' });
  assert(prompt.level === 'near_threshold', '5 of 6 should be near threshold');
  assert(prompt.message.includes('旧照片'), 'prompt should explain local-only older photos');
}

testFreeQuotaAllowsUntilLimit();
testFreeQuotaBlocksAtLimit();
testMemberQuotaIsHigher();
testMonthUsageReset();
testPhotoRetention();
testNearThresholdPrompt();
console.log('entitlementRules tests passed');
```

- [ ] **Step 2: Run the entitlement tests and verify they fail**

Run: `node miniprogram/utils/entitlementRules.test.js`

Expected: FAIL with `Cannot find module './entitlementRules'`.

- [ ] **Step 3: Implement entitlement rules**

Create `miniprogram/utils/entitlementRules.js`:

```javascript
const QUOTAS = {
  free: {
    cloud_photo_retention: 6,
    ai_ocr: 3,
    buying_consultation: 5,
    ai_report_archive: 2,
    cloud_sync: 0
  },
  member: {
    cloud_photo_retention: 120,
    ai_ocr: 60,
    buying_consultation: 100,
    ai_report_archive: 36,
    cloud_sync: 1
  }
};

function getPlan(state) {
  return state && state.plan === 'member' ? 'member' : 'free';
}

function monthKey(date) {
  const d = date || new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

function getLimit(feature, state) {
  const plan = getPlan(state);
  return QUOTAS[plan][feature] || 0;
}

function getMonthlyCount(usage, feature, date) {
  const key = monthKey(date);
  return (((usage || {})[key] || {})[feature]) || 0;
}

function getThresholdPrompt(feature, used, limit, state) {
  const plan = getPlan(state);
  if (limit <= 0) {
    return {
      level: 'membership_led',
      message: '开启会员后可使用云同步、长期历史和更高 AI 配额。'
    };
  }
  if (used >= limit) {
    return {
      level: 'at_threshold',
      message: feature === 'cloud_photo_retention'
        ? `云端照片空间已满，将仅保留最新 ${limit} 张；更早照片会留在本地记录中。`
        : `本月免费云端额度已用完。日常记录仍可继续保存在本地，会员可解锁更高额度。`
    };
  }
  if (used >= Math.max(1, limit - 1) && plan === 'free') {
    return {
      level: 'near_threshold',
      message: feature === 'cloud_photo_retention'
        ? '云端照片空间快满了，旧照片会变为本地记录优先展示。'
        : '本月免费云端额度快用完了，核心记录不受影响。'
    };
  }
  return { level: 'none', message: '' };
}

function canUseCloudFeature(feature, state, usage, date) {
  const limit = getLimit(feature, state);
  const used = getMonthlyCount(usage, feature, date);
  const allowed = limit > 0 && used < limit;
  return {
    allowed,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    prompt: getThresholdPrompt(feature, used, limit, state)
  };
}

function incrementUsage(usage, feature, date) {
  const key = monthKey(date);
  const next = { ...(usage || {}) };
  next[key] = { ...(next[key] || {}) };
  next[key][feature] = (next[key][feature] || 0) + 1;
  return next;
}

function getCloudPhotoRetention(state) {
  return getLimit('cloud_photo_retention', state);
}

function getReportArchiveLimit(state) {
  return getLimit('ai_report_archive', state);
}

function canSync(state) {
  return getLimit('cloud_sync', state) > 0;
}

module.exports = {
  QUOTAS,
  monthKey,
  getLimit,
  getThresholdPrompt,
  canUseCloudFeature,
  incrementUsage,
  getCloudPhotoRetention,
  getReportArchiveLimit,
  canSync
};
```

- [ ] **Step 4: Run the entitlement tests and verify they pass**

Run: `node miniprogram/utils/entitlementRules.test.js`

Expected: PASS with `entitlementRules tests passed`.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/entitlementRules.js miniprogram/utils/entitlementRules.test.js
git commit -m "feat: add entitlement threshold rules"
```

## Task 3: Cloud Enhancement Wrapper And Fallback Reports

**Files:**
- Create: `miniprogram/utils/cloudEnhancements.js`
- Create: `miniprogram/utils/cloudEnhancements.test.js`
- Create: `miniprogram/utils/reportFallback.js`
- Create: `miniprogram/utils/reportFallback.test.js`

- [ ] **Step 1: Write failing cloud wrapper and fallback tests**

Create `miniprogram/utils/cloudEnhancements.test.js`:

```javascript
const cloud = require('./cloudEnhancements');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testMissingCloudReturnsOkFalse() {
  global.wx = {};
  const result = await cloud.callFunctionSafe('skinDiaryAnalysis', {});
  assert(result.ok === false, 'missing wx.cloud should return ok false');
  assert(result.error.includes('cloud unavailable'), 'error should explain cloud unavailable');
}

async function testUploadFailureDoesNotThrow() {
  global.wx = {
    cloud: {
      uploadFile(options) {
        options.fail(new Error('upload failed'));
      }
    }
  };
  const result = await cloud.uploadFileSafe('x/y.jpg', 'tmp/a.jpg');
  assert(result.ok === false, 'upload failure should return ok false');
}

async function testCallFunctionSuccessShape() {
  global.wx = {
    cloud: {
      callFunction(options) {
        options.success({ result: { success: true, data: { ok: 1 } } });
      }
    }
  };
  const result = await cloud.callFunctionSafe('buyingConsultation', { productName: 'test' });
  assert(result.ok === true, 'function success should return ok true');
  assert(result.data.ok === 1, 'function data should unwrap result data');
}

(async () => {
  await testMissingCloudReturnsOkFalse();
  await testUploadFailureDoesNotThrow();
  await testCallFunctionSuccessShape();
  console.log('cloudEnhancements tests passed');
})();
```

Create `miniprogram/utils/reportFallback.test.js`:

```javascript
const fallback = require('./reportFallback');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoMedicalClaims(text) {
  ['诊断', '治疗', '处方', '皮炎', '毛囊炎'].forEach(word => {
    assert(!text.includes(word), `fallback should not include ${word}`);
  });
}

function testWeeklyFallbackShape() {
  const report = fallback.buildWeeklyReportFallback([{ ratings: { oiliness: 4 }, triggers: ['stay_up'] }], []);
  assert(report.overall_summary, 'weekly fallback should include overall_summary');
  assert(report.trigger_analysis, 'weekly fallback should include trigger_analysis');
  assert(report.cabinet_matching, 'weekly fallback should include cabinet_matching');
  assert(report.action_plan, 'weekly fallback should include action_plan');
  assert(report.sweet_tip, 'weekly fallback should include sweet_tip');
  assertNoMedicalClaims(Object.values(report).join(' '));
}

function testBuyingFallbackShape() {
  const result = fallback.buildBuyingFallback('维C精华', { sensitivity: 'stable' }, []);
  assert(typeof result.suitability_score === 'number', 'buying fallback should include score');
  assert(result.hype_check, 'buying fallback should include hype_check');
  assert(result.conflict_warnings, 'buying fallback should include conflict_warnings');
  assert(result.cabinet_overlap, 'buying fallback should include cabinet_overlap');
  assert(result.verdict, 'buying fallback should include verdict');
  assertNoMedicalClaims(Object.values(result).join(' '));
}

testWeeklyFallbackShape();
testBuyingFallbackShape();
console.log('reportFallback tests passed');
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
```

Expected: both fail with missing modules.

- [ ] **Step 3: Implement cloud enhancement wrapper**

Create `miniprogram/utils/cloudEnhancements.js`:

```javascript
function hasCloud() {
  return !!(typeof wx !== 'undefined' && wx.cloud);
}

function normalizeError(error) {
  if (!error) return 'unknown cloud error';
  return error.message || error.errMsg || String(error);
}

function uploadFileSafe(cloudPath, filePath) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => resolve({ ok: true, data: res.fileID || res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function callFunctionSafe(name, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.callFunction({
        name,
        data,
        success: res => {
          const result = res.result || {};
          if (result.success) {
            resolve({ ok: true, data: result.data, meta: result.meta || {} });
          } else {
            resolve({ ok: false, data: result.data || null, error: result.error || 'cloud function failed', meta: result.meta || {} });
          }
        },
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function addDocumentSafe(collection, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.database().collection(collection).add({
        data,
        success: res => resolve({ ok: true, data: res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function updateDocumentSafe(collection, id, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.database().collection(collection).doc(id).update({
        data,
        success: res => resolve({ ok: true, data: res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

module.exports = {
  uploadFileSafe,
  callFunctionSafe,
  addDocumentSafe,
  updateDocumentSafe
};
```

- [ ] **Step 4: Implement fallback report builders**

Create `miniprogram/utils/reportFallback.js`:

```javascript
function includesActive(product) {
  const text = `${product.product_name || ''} ${(product.ingredients || []).join(' ')} ${product.active_ingredients || ''}`.toLowerCase();
  return text.includes('a醇') || text.includes('retinol') || text.includes('酸') || text.includes('acid');
}

function buildWeeklyReportFallback(diaries, cabinet) {
  const logs = diaries || [];
  const products = cabinet || [];
  const triggerCount = {};
  let oiliness = 0;
  let rednessCount = 0;
  logs.forEach(item => {
    const ratings = item.ratings || {};
    oiliness += Number(ratings.oiliness || 3);
    if (ratings.redness >= 3 || (item.statuses || []).includes('redness')) rednessCount += 1;
    (item.triggers || []).forEach(trigger => {
      triggerCount[trigger] = (triggerCount[trigger] || 0) + 1;
    });
  });
  const avgOiliness = logs.length ? (oiliness / logs.length).toFixed(1) : '3.0';
  const hasActive = products.some(includesActive);
  return {
    overall_summary: logs.length
      ? `本周记录了 ${logs.length} 次，平均油腻感 ${avgOiliness} 分。整体建议先看趋势，不用因为单日波动焦虑。`
      : '本周本地记录还不多，先保持轻量打卡，累积几天后趋势会更清楚。',
    trigger_analysis: Object.keys(triggerCount).length
      ? `本周常见诱因是 ${Object.keys(triggerCount).join('、')}。先观察它们和泛红、出油、爆痘的同日关系。`
      : '本周诱因记录较少，可以继续留意熬夜、甜食和辛辣后的肤感变化。',
    cabinet_matching: hasActive
      ? '护肤柜里有酸类或 A 醇等强活性产品，肤况不稳时建议降低频率，优先做好温和清洁、保湿和防晒。'
      : '护肤柜目前以基础品为主，适合先维持稳定，再考虑逐步增加功效型产品。',
    action_plan: '下周优先保持早间防晒、晚间温和清洁和基础保湿；如果连续泛红或刺痛，暂停强活性产品并减少叠加步骤。',
    sweet_tip: '记录已经很有价值了，护肤不用每天满分，能看见自己的节奏就很好。'
  };
}

function buildBuyingFallback(productName, profile, cabinet) {
  const name = productName || '目标产品';
  const sensitivity = profile && profile.sensitivity;
  const hasSimilar = (cabinet || []).some(item => {
    const text = `${item.product_name || ''} ${(item.ingredients || []).join(' ')}`;
    return name && text.includes(name.slice(0, 2));
  });
  const sensitive = sensitivity === 'severe';
  return {
    suitability_score: sensitive ? 5 : 7,
    hype_check: `${name} 的卖点需要回到成分、肤感和使用频率判断，不建议只按种草文案下单。`,
    conflict_warnings: sensitive
      ? '你当前标记为易敏感肤况，建议避开高浓度酸类、A 醇和强刺激香精，先小范围试用。'
      : '当前肤况可按低频率尝试，但不要和多个强活性产品同晚叠加。',
    cabinet_overlap: hasSimilar
      ? '护肤柜中已有相近产品，建议先用完已开封产品，避免重复囤货和过期浪费。'
      : '护肤柜中暂未发现明显重复，可根据预算和实际需求再决定。',
    verdict: '先冷静 24 小时，确认它解决的是你的真实需求，而不是刚好刷到的心动。'
  };
}

module.exports = {
  buildWeeklyReportFallback,
  buildBuyingFallback
};
```

- [ ] **Step 5: Run cloud wrapper and fallback tests**

Run:

```bash
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/cloudEnhancements.js miniprogram/utils/cloudEnhancements.test.js miniprogram/utils/reportFallback.js miniprogram/utils/reportFallback.test.js
git commit -m "feat: add cloud enhancement fallbacks"
```

## Task 4: Refactor Profile And Routine To Local-First

**Files:**
- Modify: `miniprogram/pages/questionnaire/questionnaire.js`
- Modify: `miniprogram/pages/index/index.js`

- [ ] **Step 1: Update questionnaire imports and local-first submit**

Modify the top of `miniprogram/pages/questionnaire/questionnaire.js`:

```javascript
const localData = require('../../utils/localData');
const cloudEnhancements = require('../../utils/cloudEnhancements');

Page({
```

Replace `onLoad()` storage read with:

```javascript
  onLoad() {
    try {
      const profile = localData.getSkinProfile();
      if (profile) {
        const goalsMap = {
          hydrate: false,
          oil_control: false,
          acne_marks: false,
          anti_aging: false,
          barrier: false
        };
        if (profile.goals && Array.isArray(profile.goals)) {
          profile.goals.forEach(goal => {
            if (goalsMap[goal] !== undefined) {
              goalsMap[goal] = true;
            }
          });
        }
        this.setData({
          skinType: profile.skin_type || '',
          sensitivity: profile.sensitivity || '',
          goalsMap
        });
      }
    } catch (e) {
      console.error('Failed to load cached skin profile', e);
    }
  },
```

Replace the save/sync block inside `onSubmit()` after `skinProfile` is built:

```javascript
    const savedProfile = localData.saveSkinProfile(skinProfile);

    wx.hideLoading();
    wx.showToast({
      title: '方案已保存在本地',
      icon: 'success',
      duration: 1200
    });

    cloudEnhancements.addDocumentSafe('users', {
      skin_profile: {
        ...savedProfile,
        sync_status: 'synced',
        synced_at: new Date().toISOString()
      },
      created_at: new Date()
    }).then(result => {
      if (!result.ok) {
        console.warn('Skin profile cloud sync skipped:', result.error);
      }
    });

    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1200);
```

- [ ] **Step 2: Update routine page to read local data first**

Modify the top of `miniprogram/pages/index/index.js`:

```javascript
const { generateSteps } = require('../../utils/routineEngine');
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');

Page({
```

Replace the start of `onShow()` with:

```javascript
  onShow() {
    const profile = localData.getSkinProfile();
    if (!profile) {
      wx.navigateTo({
        url: '/pages/questionnaire/questionnaire'
      });
      return;
    }

    this.loadProfileAndRoutine();
  },
```

Replace the body of `loadProfileAndRoutine()` with:

```javascript
  loadProfileAndRoutine() {
    const profile = localData.getSkinProfile();
    const cabinetList = localData.getCabinetProducts().filter(item => item.status === 'opened');

    const typeMap = {
      oily: '偏油肌',
      dry: '偏干肌',
      combination: '混合肌',
      unknown: '未知肤质'
    };

    const sensMap = {
      severe: '易刺痛敏肌',
      moderate: '偶尔泛红肌',
      stable: '强韧耐受肌'
    };

    this.setData({
      skinProfile: profile,
      skinTypeChinese: typeMap[profile.skin_type] || '定制肤质',
      sensitivityChinese: sensMap[profile.sensitivity] || ''
    });

    this.generateAndMapSteps(profile, cabinetList);

    const entitlement = localData.getEntitlementState();
    if (entitlementRules.canSync(entitlement) && wx.cloud) {
      try {
        const db = wx.cloud.database();
        db.collection('skincare_cabinet').where({ status: 'opened' }).get().then(res => {
          localData.mergeCabinetProducts(res.data || []);
          this.generateAndMapSteps(profile, localData.getCabinetProducts().filter(item => item.status === 'opened'));
        }).catch(err => {
          console.warn('Cloud cabinet merge skipped:', err);
        });
      } catch (e) {
        console.warn('Cloud cabinet merge unavailable:', e);
      }
    }
  },
```

Replace direct check-in local writes in `onCheckIn()` with:

```javascript
    const saved = localData.addSkinDiary(checkInData);
```

Then in the cloud save success handler, add:

```javascript
        if (res && res._id) {
          localData.updateSkinDiary(saved._id, {
            cloud_id: res._id,
            sync_status: 'synced',
            synced_at: new Date().toISOString()
          });
        }
```

- [ ] **Step 3: Manually smoke test profile and routine**

Run: Open WeChat DevTools, clear cloud/network availability, create a profile, return to `pages/index/index`.

Expected:
- Profile saves without cloud.
- Routine renders from local profile and local cabinet.
- No blocking cloud error appears in the main flow.

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/questionnaire/questionnaire.js miniprogram/pages/index/index.js
git commit -m "refactor: make profile and routine local-first"
```

## Task 5: Refactor Cabinet And OCR Quota

**Files:**
- Modify: `miniprogram/pages/cabinet/cabinet.js`
- Modify: `miniprogram/pages/cabinet/add.js`

- [ ] **Step 1: Update cabinet list imports and load flow**

Modify the top of `miniprogram/pages/cabinet/cabinet.js`:

```javascript
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');

Page({
```

Replace `loadCabinetProducts()` with:

```javascript
  loadCabinetProducts() {
    const localProducts = localData.getCabinetProducts();
    this.processProducts(localProducts);

    const entitlement = localData.getEntitlementState();
    if (!entitlementRules.canSync(entitlement) || !wx.cloud) {
      return;
    }

    try {
      const db = wx.cloud.database();
      db.collection('skincare_cabinet')
        .get()
        .then(res => {
          const merged = localData.mergeCabinetProducts(res.data || []);
          this.processProducts(merged);
        })
        .catch(err => {
          console.warn('获取云端护肤柜失败，继续使用本地数据:', err);
        });
    } catch (e) {
      console.warn('云数据库获取失败，继续使用本地数据:', e);
    }
  },
```

Remove this line from `processProducts(products)`:

```javascript
    wx.setStorageSync('skincare_cabinet', products);
```

Replace local deletion logic in `onDeleteProduct()` with:

```javascript
          const deleteFromLocal = () => {
            localData.deleteCabinetProduct(id);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadCabinetProducts();
          };
```

- [ ] **Step 2: Update cabinet add imports and local-first save**

Modify the top of `miniprogram/pages/cabinet/add.js`:

```javascript
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');

const formatTime = date => {
```

Replace local product reads with `localData.getCabinetProducts()` in `loadProductDetails(id)`.

Replace `onOCRUpload()` cloud function section with this quota-gated flow:

```javascript
        const entitlement = localData.getEntitlementState();
        const usage = localData.getUsageState();
        const quota = entitlementRules.canUseCloudFeature('ai_ocr', entitlement, usage, new Date());

        if (!quota.allowed) {
          wx.hideLoading();
          wx.showModal({
            title: '本月 AI 识别额度已用完',
            content: quota.prompt.message,
            confirmText: '手动填写',
            showCancel: false
          });
          return;
        }

        const cloudPath = `ocr/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
        cloudEnhancements.uploadFileSafe(cloudPath, tempFilePath).then(upload => {
          if (!upload.ok) {
            wx.hideLoading();
            wx.showToast({ title: '图片上传失败，已采用本地模拟识别', icon: 'none' });
            this.fillOCRData({
              product_name: '理肤泉 B5 修复面霜',
              category: 'cream',
              pao_months: 6,
              ingredients: ['积雪草', 'B5']
            });
            return;
          }
          return cloudEnhancements.callFunctionSafe('skincareCabinetOCR', { fileID: upload.data }).then(ocrRes => {
            wx.hideLoading();
            if (ocrRes.ok) {
              localData.saveUsageState(entitlementRules.incrementUsage(usage, 'ai_ocr', new Date()));
              this.fillOCRData(ocrRes.data);
              wx.showToast({ title: 'AI 填表成功！', icon: 'success' });
            } else {
              wx.showToast({ title: '识别失败，已采用默认回填', icon: 'none' });
              this.fillOCRData({
                product_name: '已上传待核对品名',
                category: 'essence',
                pao_months: 12,
                ingredients: ['玻尿酸']
              });
            }
          });
        });
```

Replace `handleLocalSave` and cloud add/update logic in `onSubmit()` with:

```javascript
    const productPayload = {
      _id: this.data.isEdit ? this.data.productId : undefined,
      product_name: productName,
      category,
      opened_date: openedDate,
      pao_months: parseInt(paoMonths),
      ingredients: selectedIngredients,
      status: 'opened'
    };

    const saved = localData.upsertCabinetProduct(productPayload);

    wx.hideLoading();
    wx.showToast({ title: this.data.isEdit ? '修改成功' : '录入成功', icon: 'success' });

    const cloudPayload = {
      product_name: saved.product_name,
      category: saved.category,
      opened_date: saved.opened_date,
      pao_months: saved.pao_months,
      ingredients: saved.ingredients,
      status: saved.status,
      updated_at: new Date()
    };

    const syncPromise = this.data.isEdit && !saved._id.startsWith('local_')
      ? cloudEnhancements.updateDocumentSafe('skincare_cabinet', saved._id, cloudPayload)
      : cloudEnhancements.addDocumentSafe('skincare_cabinet', { ...cloudPayload, created_at: new Date() });

    syncPromise.then(result => {
      if (result.ok && result.data && result.data._id && saved._id.startsWith('local_')) {
        localData.deleteCabinetProduct(saved._id);
        localData.upsertCabinetProduct({
          ...saved,
          _id: result.data._id,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
      } else if (!result.ok) {
        console.warn('Cabinet cloud sync skipped:', result.error);
      }
    });

    setTimeout(() => wx.navigateBack(), 1000);
```

- [ ] **Step 3: Run utility tests**

Run:

```bash
node miniprogram/utils/localData.test.js
node miniprogram/utils/entitlementRules.test.js
node miniprogram/utils/cloudEnhancements.test.js
```

Expected: all PASS.

- [ ] **Step 4: Manual smoke test cabinet**

Run: In WeChat DevTools with cloud unavailable, add, edit, delete one product.

Expected:
- Product appears immediately after save.
- Edit persists across tab changes.
- Delete removes local item.
- OCR quota exhaustion shows a membership-led prompt and does not block manual entry.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/cabinet/cabinet.js miniprogram/pages/cabinet/add.js
git commit -m "refactor: make cabinet local-first with OCR quota"
```

## Task 6: Refactor Diary, Photo Retention, And AI Report Cache

**Files:**
- Modify: `miniprogram/pages/diary/diary.js`

- [ ] **Step 1: Add diary page imports**

Modify the top of `miniprogram/pages/diary/diary.js`:

```javascript
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');
const reportFallback = require('../../utils/reportFallback');

Page({
```

- [ ] **Step 2: Replace profile and stats reads with local data**

Replace `checkUserSession()` profile check with:

```javascript
    const hasProfile = !!localData.getSkinProfile();
```

Replace `loadCheckInStats()` with:

```javascript
  loadCheckInStats() {
    const localLogs = localData.getSkinDiaries();
    const sevenDaysAgoTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const localCount = localLogs.filter(log => {
      const dStr = log.created_at || log.date;
      const logDate = new Date(dStr).getTime();
      return logDate >= sevenDaysAgoTime;
    }).length;

    const photoRecords = localLogs.filter(log => (log.local_photo_path || log.photo_path || log.cloud_file_id));
    let beforeUrl = 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600';
    let afterUrl = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600';

    if (photoRecords.length >= 2) {
      beforeUrl = photoRecords[photoRecords.length - 1].local_photo_path || photoRecords[photoRecords.length - 1].photo_path || photoRecords[photoRecords.length - 1].cloud_file_id;
      afterUrl = photoRecords[0].local_photo_path || photoRecords[0].photo_path || photoRecords[0].cloud_file_id;
    } else if (photoRecords.length === 1) {
      afterUrl = photoRecords[0].local_photo_path || photoRecords[0].photo_path || photoRecords[0].cloud_file_id;
    }

    this.setData({ checkInCount: localCount });
    this.updateCompareImages(beforeUrl, afterUrl);
  },
```

- [ ] **Step 3: Replace photo upload with quota-aware upload**

Replace `uploadPhotoToCloud()` with:

```javascript
  uploadPhotoToCloud(localDiaryId) {
    return new Promise(resolve => {
      if (!this.data.photoPath) {
        resolve('');
        return;
      }

      const entitlement = localData.getEntitlementState();
      const retention = entitlementRules.getCloudPhotoRetention(entitlement);
      const cloudPhotos = localData.getSkinDiaries().filter(item => item.cloud_file_id);
      const prompt = entitlementRules.getThresholdPrompt('cloud_photo_retention', cloudPhotos.length, retention, entitlement);

      if (prompt.level === 'at_threshold') {
        wx.showToast({ title: '云照片空间已满，本次仅保存在本地', icon: 'none' });
        resolve('');
        return;
      }
      if (prompt.level === 'near_threshold') {
        wx.showToast({ title: '云照片空间快满了', icon: 'none' });
      }

      const filePath = this.data.photoPath;
      const cloudPath = `skin_diaries/${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`;
      cloudEnhancements.uploadFileSafe(cloudPath, filePath).then(result => {
        if (result.ok) {
          localData.updateSkinDiary(localDiaryId, {
            cloud_file_id: result.data,
            photo_path: result.data,
            photo_sync_status: 'synced'
          });
          resolve(result.data);
        } else {
          localData.updateSkinDiary(localDiaryId, {
            photo_sync_status: 'failed',
            sync_error: result.error
          });
          wx.showToast({ title: '照片上传失败，日记已本地保存', icon: 'none' });
          resolve('');
        }
      });
    });
  },
```

- [ ] **Step 4: Replace diary save with local-first flow**

Replace `saveDiary()` with:

```javascript
  async saveDiary() {
    wx.showLoading({ title: '正在保存日记...' });

    const activeTriggers = this.data.triggerOptions
      .filter(t => t.checked)
      .map(t => t.value);

    const isRednessChecked = this.data.statusOptions.find(s => s.value === 'redness')?.checked || false;
    const isAcneChecked = this.data.statusOptions.find(s => s.value === 'acne')?.checked || false;
    const isPeelingChecked = this.data.statusOptions.find(s => s.value === 'peeling')?.checked || false;

    const localDiary = localData.addSkinDiary({
      date: new Date().toISOString().split('T')[0],
      ratings: {
        oiliness: this.data.oiliness,
        redness: isRednessChecked ? 5 : 1,
        acne: isAcneChecked ? 5 : 1,
        peeling: isPeelingChecked ? 5 : 1
      },
      statuses: [
        ...(isRednessChecked ? ['red', 'redness'] : []),
        ...(isAcneChecked ? ['acne'] : []),
        ...(isPeelingChecked ? ['peel', 'peeling'] : [])
      ],
      triggers: activeTriggers,
      local_photo_path: this.data.photoPath,
      created_at: new Date().toISOString()
    });

    wx.hideLoading();
    wx.showToast({
      title: '今日打卡已保存！',
      icon: 'success',
      duration: 2000
    });

    this.loadCheckInStats();
    this.setData({
      photoPath: '',
      oiliness: 3,
      statusOptions: this.data.statusOptions.map(s => ({ ...s, checked: false })),
      triggerOptions: this.data.triggerOptions.map(t => ({ ...t, checked: false }))
    });

    const cloudPhotoPath = await this.uploadPhotoToCloud(localDiary._id);
    const cloudPayload = {
      ...localDiary,
      photo_path: cloudPhotoPath,
      cloud_file_id: cloudPhotoPath,
      created_at: new Date(localDiary.created_at)
    };
    const result = await cloudEnhancements.addDocumentSafe('skin_diary', cloudPayload);
    if (result.ok && result.data && result.data._id) {
      localData.updateSkinDiary(localDiary._id, {
        cloud_id: result.data._id,
        sync_status: 'synced',
        synced_at: new Date().toISOString()
      });
    } else if (!result.ok) {
      localData.updateSkinDiary(localDiary._id, {
        sync_status: 'pending',
        sync_error: result.error
      });
    }
  },
```

- [ ] **Step 5: Replace AI report generation with cache and fallback**

Replace `triggerAnalysis()` with:

```javascript
  async triggerAnalysis() {
    wx.showLoading({ title: 'AI 闺蜜分析数据中...' });

    const entitlement = localData.getEntitlementState();
    const reportLimit = entitlementRules.getReportArchiveLimit(entitlement);
    const diaries = localData.getSkinDiaries();
    const cabinet = localData.getCabinetProducts();
    const result = await cloudEnhancements.callFunctionSafe('skinDiaryAnalysis', { diaries, cabinet });

    const report = result.ok
      ? result.data
      : reportFallback.buildWeeklyReportFallback(diaries.slice(0, 7), cabinet);
    const reportTime = new Date().toLocaleString();

    localData.saveAiReport({
      type: 'weekly',
      data: report,
      source: result.ok ? 'cloud' : 'local_fallback',
      created_at: new Date().toISOString()
    }, reportLimit);

    this.setData({
      isReportUnlocked: true,
      weeklyReport: report,
      reportTime
    });

    wx.hideLoading();
    wx.showToast({ title: result.ok ? '周度报告已生成！' : '已生成本地分析', icon: 'success' });
  },
```

- [ ] **Step 6: Run tests and manual smoke**

Run:

```bash
node miniprogram/utils/localData.test.js
node miniprogram/utils/entitlementRules.test.js
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
```

Expected: all PASS.

Manual expected:
- Cloud unavailable: diary text and scores save locally.
- Photo upload failure keeps diary visible with `photo_sync_status: failed`.
- Report generation never leaves blank UI.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/diary/diary.js
git commit -m "refactor: make diary local-first with report fallback"
```

## Task 7: Refactor Buying Consultation Quota And Fallback

**Files:**
- Modify: `miniprogram/pages/buying/buying.js`

- [ ] **Step 1: Add imports**

Modify the top of `miniprogram/pages/buying/buying.js`:

```javascript
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');
const reportFallback = require('../../utils/reportFallback');

Page({
```

- [ ] **Step 2: Replace cloud call in `startAnalysis()`**

Replace the `wx.cloud.callFunction({ name: 'buyingConsultation', ... })` block with:

```javascript
    const entitlement = localData.getEntitlementState();
    const usage = localData.getUsageState();
    const quota = entitlementRules.canUseCloudFeature('buying_consultation', entitlement, usage, new Date());

    if (!quota.allowed) {
      const fallbackResult = reportFallback.buildBuyingFallback(targetName, localData.getSkinProfile(), localData.getCabinetProducts());
      this.setData({
        isLoading: false,
        analysisResult: fallbackResult,
        productName: targetName
      });
      wx.showModal({
        title: '本月 AI 咨询额度已用完',
        content: quota.prompt.message,
        confirmText: '查看本地建议',
        showCancel: false
      });
      return;
    }

    cloudEnhancements.callFunctionSafe('buyingConsultation', {
      productName: targetName,
      skinProfile: localData.getSkinProfile(),
      cabinetSummary: localData.getCabinetProducts().map(item => item.product_name).join(', ')
    }).then(res => {
      const fallbackResult = reportFallback.buildBuyingFallback(targetName, localData.getSkinProfile(), localData.getCabinetProducts());
      this.setData({
        isLoading: false,
        analysisResult: res.ok ? res.data : fallbackResult,
        productName: targetName
      });
      if (res.ok) {
        localData.saveUsageState(entitlementRules.incrementUsage(usage, 'buying_consultation', new Date()));
        wx.showToast({ title: '分析已完成', icon: 'success' });
      } else {
        wx.showToast({ title: '已生成本地建议', icon: 'none' });
      }
    });
```

- [ ] **Step 3: Run tests and manual smoke**

Run:

```bash
node miniprogram/utils/entitlementRules.test.js
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
```

Expected: all PASS.

Manual expected:
- Buying consultation at quota limit shows a prompt but still displays a local recommendation.
- Cloud timeout displays a complete analysis card, not a blank result.

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/buying/buying.js
git commit -m "refactor: add buying consultation quota fallback"
```

## Task 8: Harden Cloud Function Failure Shapes

**Files:**
- Modify: `cloudfunctions/skinDiaryAnalysis/index.js`
- Modify: `cloudfunctions/buyingConsultation/index.js`

- [ ] **Step 1: Update `skinDiaryAnalysis` catch block**

Replace the final `catch (error)` return in `cloudfunctions/skinDiaryAnalysis/index.js` with:

```javascript
  } catch (error) {
    console.error('云函数执行出错:', error);
    const fallback = sanitizeReport(generateLocalReport(0, 3.0, 0, 0, 0, {}, false, []));
    return {
      success: true,
      data: fallback,
      meta: {
        fallback: true,
        error: error.message,
        analyzedAt: new Date().toISOString()
      }
    };
  }
```

- [ ] **Step 2: Update `buyingConsultation` catch behavior**

Wrap the body after product name validation in `cloudfunctions/buyingConsultation/index.js` with a top-level `try` and add this catch before the function closes:

```javascript
  } catch (error) {
    console.error('购买咨询云函数执行出错:', error);
    const fallback = sanitizeResult(generateLocalAnalysis(productName, {
      skin_type: 'combination',
      sensitivity: 'moderate',
      goals: ['hydrate'],
      budget: 'moderate'
    }, '护肤柜暂空'));
    return {
      success: true,
      data: fallback,
      meta: {
        fallback: true,
        error: error.message,
        analyzedAt: new Date().toISOString()
      }
    };
  }
```

The resulting `exports.main` structure must be:

```javascript
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || 'mock-openid';
  const { productName } = event;

  if (!productName) {
    return {
      success: false,
      error: '商品名称不能为空'
    };
  }

  try {
    // existing analysis implementation stays here
  } catch (error) {
    console.error('购买咨询云函数执行出错:', error);
    const fallback = sanitizeResult(generateLocalAnalysis(productName, {
      skin_type: 'combination',
      sensitivity: 'moderate',
      goals: ['hydrate'],
      budget: 'moderate'
    }, '护肤柜暂空'));
    return {
      success: true,
      data: fallback,
      meta: {
        fallback: true,
        error: error.message,
        analyzedAt: new Date().toISOString()
      }
    };
  }
};
```

- [ ] **Step 3: Run cloud function syntax checks**

Run:

```bash
node -c cloudfunctions/skinDiaryAnalysis/index.js
node -c cloudfunctions/buyingConsultation/index.js
```

Expected: both commands exit with no output and code 0.

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/skinDiaryAnalysis/index.js cloudfunctions/buyingConsultation/index.js
git commit -m "fix: return friendly AI fallbacks from cloud functions"
```

## Task 9: Documentation And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add local-first architecture docs**

Append this section to `README.md`:

```markdown
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
```

- [ ] **Step 2: Run all automated checks**

Run:

```bash
node miniprogram/utils/localData.test.js
node miniprogram/utils/entitlementRules.test.js
node miniprogram/utils/cloudEnhancements.test.js
node miniprogram/utils/reportFallback.test.js
node -c cloudfunctions/skinDiaryAnalysis/index.js
node -c cloudfunctions/buyingConsultation/index.js
```

Expected: all utility tests print PASS messages; syntax checks print no output.

- [ ] **Step 3: Run acceptance smoke checks**

In WeChat DevTools:

- Clear local storage, disable cloud, create skin profile.
- Add one cabinet product manually.
- Generate today routine.
- Save one diary with oiliness, statuses, triggers, and a selected photo.
- Generate weekly report with cloud unavailable.
- Open buying consultation and run one analysis with cloud unavailable.

Expected:
- Core data remains readable after page refresh.
- No cloud failure blocks routine, diary writing, or cabinet editing.
- Photo upload failure marks local diary as valid.
- AI failure shows cached/rule-based/friendly results.
- Membership prompts mention storage, sync, history, archive, or AI quota only.

- [ ] **Step 4: Commit docs and verification**

```bash
git add README.md
git commit -m "docs: document local-first cloud enhancement"
```

## Self-Review

- Spec coverage: The plan covers local data service, optional cloud layer, entitlement thresholds, membership prompt states, local-first read/write flow, latest-write-wins merge, photo upload fallback, AI quota/fallback, privacy-safe membership framing, migration through service boundaries, and existing key compatibility.
- Placeholder scan: The plan contains concrete file paths, commands, expected outcomes, and code blocks for implementation steps.
- Type consistency: Utility names used by page tasks match definitions: `localData`, `entitlementRules`, `cloudEnhancements`, and `reportFallback`; quota feature names are consistent: `ai_ocr`, `buying_consultation`, `cloud_photo_retention`, `ai_report_archive`.
