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
    updated_at: product.updated_at || nowIso(),
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
    updated_at: diary.updated_at || nowIso(),
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
