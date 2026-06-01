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
