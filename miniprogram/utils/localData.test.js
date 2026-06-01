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
