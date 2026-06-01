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
