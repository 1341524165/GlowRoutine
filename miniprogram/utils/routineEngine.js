// 护肤步骤规则决策引擎
function generateSteps(profile, isRedAlert) {
  let morning = [
    { step: "洁面", requirement: "温和洁面", desc: "温水洗脸即可，清除多余油脂与浮尘" },
    { step: "爽肤", requirement: "保湿爽肤", desc: "轻拍舒缓保湿水，唤醒晨间肌肤" }
  ];
  let evening = [
    { step: "洁面", requirement: "温和清洁", desc: "使用温和氨基酸洁面，彻底清除白日灰尘" },
    { step: "爽肤", requirement: "修护爽肤", desc: "使用补水保湿爽肤水，为后续保养打底" }
  ];
  let banList = [];

  const isSevere = profile && profile.sensitivity === 'severe';
  const isModerate = profile && profile.sensitivity === 'moderate';

  // 1. 泛红警报期（isRedAlert）或极度敏感肌强制关闭一切活性成分步骤，推荐极简温和修护
  if (isRedAlert || isSevere) {
    morning.push({ step: "防晒", requirement: "物理防晒", desc: "敏感期强烈建议使用纯物理防晒霜，物理阻隔防紫外线" });
    
    // 极简修护：只补充舒缓面霜，不加任何功能性精华
    evening.push({ step: "乳霜", requirement: "屏障修护霜", desc: "使用含神经酰胺/B5/积雪草的温和修护霜锁水" });
    
    banList = ["retinol", "acid", "exfoliator"];
    return {
      morning,
      evening,
      banList,
      alertMsg: "🚨 肤况正处于泛红警报期或极度敏感期，今日已为您强制精简护肤，禁用A醇、酸类及去角质产品！"
    };
  }

  // 2. 常规肤质：根据问卷核心目标动态匹配步骤
  const goals = (profile && profile.goals) || [];

  // --- 晨间 Routine 动态匹配 ---
  
  // 控油目标：晨间使用清爽洁面与控油精华
  if (goals.includes('oil_control')) {
    // 替换默认洁面
    const index = morning.findIndex(x => x.step === '洁面');
    if (index !== -1) {
      morning[index] = { step: "洁面", requirement: "清爽控油洁面", desc: "含有氨基酸的温和控油洁面，洗净多余皮脂" };
    }
    morning.push({ step: "精华", requirement: "清爽控油精华", desc: "使用含烟酰胺或PCA锌的精华，平稳晨间油脂分泌" });
  }

  // 保湿目标：晨间使用玻尿酸/B5精华
  if (goals.includes('hydrate') && !morning.some(x => x.requirement.includes('控油精华'))) {
    morning.push({ step: "精华", requirement: "深层保湿精华", desc: "使用玻尿酸/B5等强效抓水精华，长效锁水" });
  }

  // 屏障修护目标：晨间修护
  if (goals.includes('barrier') && !morning.some(x => x.step === '精华')) {
    morning.push({ step: "精华", requirement: "屏障修护精华", desc: "含有积雪草或神经酰胺精华，强韧肌底屏障" });
  }

  // 晨间防晒是常规肤质的标配
  morning.push({ step: "防晒", requirement: "广谱防晒", desc: "涂抹清爽防晒霜，强效阻隔紫外线以防光老化" });


  // --- 晚间 Routine 动态匹配 ---

  // 屏障修护目标优先：使用舒缓修护精华和屏障霜
  if (goals.includes('barrier')) {
    evening.push({ step: "精华", requirement: "屏障舒缓精华", desc: "积雪草或依克多因修护精华，快速退红镇静" });
    evening.push({ step: "乳霜", requirement: "屏障修护晚霜", desc: "厚涂强效角质层修护面霜，强韧皮脂膜" });
  }

  // 抗初老目标（晚间黄金期使用A醇）：注意不能是极敏感肌，中度敏感肌需适度建立耐受
  if (goals.includes('anti_aging')) {
    if (!isSevere) {
      evening.push({ step: "精华", requirement: "抗初老A醇精华", desc: "晚间抗衰黄金期，使用A醇促进胶原再生，淡化细纹（敏感肌请局部建立耐受）" });
    }
  }

  // 淡痘印目标：使用淡斑美白活性精华
  if (goals.includes('acne_marks') && !evening.some(x => x.requirement.includes('A醇精华'))) {
    evening.push({ step: "精华", requirement: "淡印亮肤精华", desc: "含有377或传明酸等高效淡印成分，改善色素沉淀" });
  }

  // 保湿目标晚间锁水面霜
  if (goals.includes('hydrate') && !evening.some(x => x.step === '乳霜')) {
    evening.push({ step: "乳霜", requirement: "高保湿锁水面霜", desc: "使用强锁水面霜，在夜间睡眠中长效锁住水分" });
  }

  // 如果晚间没有任何面霜，加一个温和保湿乳/面霜作兜底
  if (!evening.some(x => x.step === '乳霜')) {
    evening.push({ step: "乳霜", requirement: "温和保湿面霜", desc: "温和基础面霜，轻盈锁水不闷痘" });
  }

  // 警示提醒文案
  let alertMsg = "🟢 今日肤况稳定，可以进行常规功能性保养。";
  if (isModerate) {
    alertMsg = "⚠️ 皮肤偶有泛红泛酸。建议功能性精华减半使用，并配合屏障修护乳液。";
  }

  return {
    morning,
    evening,
    banList,
    alertMsg
  };
}

module.exports = { generateSteps };
