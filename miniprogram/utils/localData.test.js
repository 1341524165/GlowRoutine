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

function testUpdateSkinDiaryId() {
  resetStore();
  const diary = localData.addSkinDiary({
    date: '2026-06-01',
    ratings: { oiliness: 4, redness: 1, acne: 1, peeling: 1 },
    statuses: [],
    triggers: ['stay_up']
  });
  
  assert(localData.getSkinDiaries().length === 1, 'diary should be stored');
  assert(localData.getSkinDiaries()[0]._id === diary._id, 'diary should have local ID');

  const cloudId = 'cloud_diary_123456';
  localData.updateSkinDiaryId(diary._id, cloudId, {
    sync_status: 'synced',
    synced_at: '2026-06-01T02:00:00.000Z'
  });

  const updatedDiaries = localData.getSkinDiaries();
  assert(updatedDiaries.length === 1, 'diary should NOT be duplicated');
  assert(updatedDiaries[0]._id === cloudId, 'diary should have updated cloud ID');
  assert(updatedDiaries[0].sync_status === 'synced', 'diary sync status should be synced');
}

testSkinProfileUsesExistingKeys();
testCabinetUpsertAndDelete();
testDiaryLocalFirstShape();
testLatestWriteWinsMerge();
testReportArchiveLimit();
testUpdateSkinDiaryId();

function testGetWeeklyTrendStats() {
  resetStore();
  // 注入 Mock 3次打卡数据
  localData.addSkinDiary({
    date: '2026-06-01',
    ratings: { oiliness: 4, redness: 5, acne: 1, peeling: 1 },
    statuses: ['red', 'redness'],
    triggers: ['stay_up', 'spicy']
  });
  localData.addSkinDiary({
    date: '2026-06-02',
    ratings: { oiliness: 2, redness: 1, acne: 5, peeling: 1 },
    statuses: ['acne'],
    triggers: ['stay_up', 'sugar']
  });
  
  const stats = localData.getWeeklyTrendStats();
  assert(stats.oilinessList.length === 2, 'should have 2 records');
  assert(stats.oilinessList[1] === 2, 'newest should be last when reversed (chronological order)');
  assert(stats.oilinessList[0] === 4, 'oldest should be first when reversed (chronological order)');
  assert(stats.alertCounts.redness === 1, 'redness count should be 1');
  assert(stats.alertCounts.acne === 1, 'acne count should be 1');
  assert(stats.triggerCounts['stay_up'] === 2, 'stay_up count should be 2');
}

testGetWeeklyTrendStats();
console.log('localData tests passed');
