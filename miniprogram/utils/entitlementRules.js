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
