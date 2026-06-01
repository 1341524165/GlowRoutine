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
      ? `本周常见诱因是 ${Object.keys(triggerCount).join('、')}。先观察它们 and 泛红、出油、爆痘的同日关系。`.replace(' and ', '、')
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
      : '护肤柜中暂未发现明显重复，可根据预算 and 实际需求再决定。'.replace(' and ', '和'),
    verdict: '先冷静 24 小时，确认它解决的是你的真实需求，而不是刚好刷到的心动。'
  };
}

module.exports = {
  buildWeeklyReportFallback,
  buildBuyingFallback
};
