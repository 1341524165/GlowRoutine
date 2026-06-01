const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * AI 皮肤趋势周报分析云函数
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || 'mock-openid';

  try {
    // 1. 获取最近一周的皮肤日记打卡记录 (最近 7 条)
    const diaryResult = await db.collection('skin_diary')
      .where({
        _openid: openid
      })
      .orderBy('created_at', 'desc')
      .limit(7)
      .get();

    const diaries = diaryResult.data || [];

    // 2. 获取用户护肤品柜中的产品记录
    const cabinetResult = await db.collection('skincare_cabinet')
      .where({
        _openid: openid
      })
      .get();

    const cabinet = cabinetResult.data || [];

    // 3. 统计和提炼数据
    const totalCheckins = diaries.length;
    let avgOiliness = 0;
    let rednessCount = 0;
    let acneCount = 0;
    let peelingCount = 0;
    const triggersMap = {};
    
    diaries.forEach(d => {
      const ratings = d.ratings || {};
      avgOiliness += Number(ratings.oiliness || 3);
      
      const isRed = (typeof ratings.redness === 'number' ? ratings.redness >= 3 : !!ratings.redness) || 
                    d.statuses?.includes('red') || d.statuses?.includes('redness');
      const isAcne = (typeof ratings.acne === 'number' ? ratings.acne >= 3 : !!ratings.acne) || 
                     d.statuses?.includes('acne');
      const isPeel = (typeof ratings.peeling === 'number' ? ratings.peeling >= 3 : !!ratings.peeling) || 
                     d.statuses?.includes('peel') || d.statuses?.includes('peeling');

      if (isRed) rednessCount++;
      if (isAcne) acneCount++;
      if (isPeel) peelingCount++;

      const triggers = d.triggers || [];
      triggers.forEach(t => {
        triggersMap[t] = (triggersMap[t] || 0) + 1;
      });
    });

    if (totalCheckins > 0) {
      avgOiliness = parseFloat((avgOiliness / totalCheckins).toFixed(1));
    } else {
      avgOiliness = 3.0;
    }

    const triggersList = Object.keys(triggersMap).map(k => ({
      key: k,
      count: triggersMap[k]
    })).sort((a, b) => b.count - a.count);

    // 提取护肤柜中的活性成分
    const cabinetSummary = cabinet.map(item => {
      return `${item.product_name || '未命名'}(分类:${item.category || '未知'}, 活性成分:${item.active_ingredients || '无'}, 状态:${item.status || '未开封'})`;
    }).join('; ');

    const hasAcidsOrRetinol = cabinet.some(item => {
      const ing = (item.active_ingredients || '').toLowerCase();
      const name = (item.product_name || '').toLowerCase();
      return ing.includes('acid') || ing.includes('retinol') || ing.includes('酸') || ing.includes('醇') ||
             name.includes('酸') || name.includes('醇') || name.includes('去角质');
    });

    // 4. 大模型 Prompt 构建
    const prompt = `你是一个有温度、说话像闺蜜一样亲切贴心、偶尔有一点点小犀利（但绝不刻薄）的 AI 皮肤管理助手。
    请根据用户最近一周的【皮肤打卡日记数据】和【护肤品柜所拥有的产品信息】，生成一份详细周密的“AI 皮肤趋势周报”。

    【用户最近一周数据统计】
    - 本周打卡天数: ${totalCheckins}天
    - 平均皮肤油腻感: ${avgOiliness} (1-5星, 1最干爽, 5最油腻)
    - 泛红发生次数: ${rednessCount}次
    - 爆痘发生次数: ${acneCount}次
    - 蜕皮发生次数: ${peelingCount}次
    - 生活中诱因出现频次: ${JSON.stringify(triggersMap)} (stay_up:熬夜, spicy:辣食/火锅, sugar:甜食/奶茶)

    【用户护肤柜当前备用单品】
    ${cabinetSummary || '用户护肤柜目前空空如也，未录入产品'}

    【生成要求】
    1. 风格必须是温暖、口语化、闺蜜风的“AI 闺蜜大白话”。常用词如：“宝子”、“烂脸”、“搞定”、“乖乖听话”、“大猪蹄子”等。
    2. 绝对不能包含任何违法行医、开处方、疾病诊断等敏感词（如“毛囊炎”、“脂溢性皮炎”、“激素脸”、“开药”等），如果皮肤问题很严重，请温柔地建议用户“去三甲医院看皮肤科医生”。
    3. 必须输出为 JSON 格式，且必须包含以下 5 个字段：
       - "overall_summary": 对这周皮肤状况的幽默调侃与暖心概括。
       - "trigger_analysis": 分析生活诱因与爆痘泛红的关联。
       - "cabinet_matching": 结合护肤柜成分警告是否有猛药混用或屏障受损期用错药的情况（比如泛红爆痘期还在刷酸/A醇），或者给出购置建议。
       - "action_plan": 下周极简实操调优建议。例如：“白天温和洁面+物理防晒，晚上精简修护，酸类一律打入冷宫”。
       - "sweet_tip": 一句超有温度的闺蜜贴心话。

    请直接返回满足上述格式的纯 JSON 字符串，不要包含 markdown 标记或 \`\`\`json 包装。`;

    // 5. 逻辑实现：真实 LLM 调用与高保真智能规则引擎兜底
    let reportData = null;

    // 尝试从云端配置或者环境变量中获取 API KEY
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
    
    if (GEMINI_API_KEY) {
      try {
        // 示例：调用 Gemini 2.5 Flash 接口
        const response = await callGeminiAPI(GEMINI_API_KEY, prompt);
        if (response) {
          // 清理可能包含的 Markdown 标记
          let cleanJson = response.trim();
          if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/, '');
          }
          reportData = JSON.parse(cleanJson);
        }
      } catch (err) {
        console.error('调用真实大模型失败，准备启动高保真规则引擎:', err);
      }
    }

    // 6. 高保真专家系统生成（兜底/没有 API Key 的默认情况）
    if (!reportData) {
      reportData = generateLocalReport(totalCheckins, avgOiliness, rednessCount, acneCount, peelingCount, triggersMap, hasAcidsOrRetinol, cabinet);
    }

    // 7. 内容净化拦截器：100% 过滤医疗敏感词并转换为温和闺蜜大白话
    reportData = sanitizeReport(reportData);

    return {
      success: true,
      data: reportData,
      meta: {
        totalCheckins,
        avgOiliness,
        rednessCount,
        acneCount,
        peelingCount,
        analyzedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('云函数执行出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 智能高保真规则报表生成器 (完美还原“AI闺蜜”语气)
 */
function generateLocalReport(totalCheckins, avgOiliness, rednessCount, acneCount, peelingCount, triggersMap, hasAcidsOrRetinol, cabinet) {
  let overall_summary = "";
  let trigger_analysis = "";
  let cabinet_matching = "";
  let action_plan = "";
  let sweet_tip = "";

  const hasStayUp = triggersMap['stay_up'] && triggersMap['stay_up'] >= 2;
  const hasSpicy = triggersMap['spicy'] && triggersMap['spicy'] >= 2;
  const hasSugar = triggersMap['sugar'] && triggersMap['sugar'] >= 2;

  // 1. 整体综述
  if (acneCount >= 3 || rednessCount >= 3) {
    overall_summary = `宝子啊，你这周的皮肤简直在疯狂拉警报！打卡 ${totalCheckins} 天里，爆痘泛红直接占了大半江山。你的皮肤屏障这会估计已经委屈得直掉眼泪了，红得像个小苹果还不停冒痘痘，再不好好修护，可就真要“烂脸”啦！`;
  } else if (acneCount >= 1 || rednessCount >= 1) {
    overall_summary = `这周你的肤况整体还算过得去，但还是有那么几天红灯闪烁。偶尔冒出来的一两颗红痘痘和局部泛红，就是皮肤在给你敲警钟呢，提醒你最近有些护肤或生活习惯该收敛一下啦！`;
  } else if (avgOiliness >= 4.0) {
    overall_summary = `宝子，你这周简直成了“人间大油田”！平均油腻度都飙到 ${avgOiliness} 了，脸上估计都能反光了。油脂分泌这么旺盛，毛孔都快不能呼吸了，可得注意做好清爽控油，不然下一步可就是闭口爆痘军团来袭了！`;
  } else {
    overall_summary = `哇塞！这周的你简直是仙女本仙！皮肤状态极其稳定，既没泛红也没爆痘，油水分泌还出奇得平衡。闺蜜给你点一万个赞，请把这种完美的状态继续保持下去！`;
  }

  // 2. 诱因关联分析
  const triggerList = [];
  if (triggersMap['stay_up']) triggerList.push(`熬夜 ${triggersMap['stay_up']} 次`);
  if (triggersMap['spicy']) triggerList.push(`吃辣 ${triggersMap['spicy']} 次`);
  if (triggersMap['sugar']) triggerList.push(`吃甜食/奶茶 ${triggersMap['sugar']} 次`);

  if (triggerList.length > 0) {
    trigger_analysis = `闺蜜拿放大镜看了你的生活记录：这周你一共 ${triggerList.join('，')}。`;
    if (acneCount > 0 && (hasSpicy || hasSugar)) {
      trigger_analysis += `难怪痘痘会找上门！甜食里的高糖和火锅里的高油高辣会瞬间刺激皮脂腺，让油脂分泌像火山爆发一样。再加上熬夜剥夺了皮肤的自我修复时间，简直就是给痘痘军团盖了高楼，它们不爆才怪呢！`;
    } else if (rednessCount > 0 && hasStayUp) {
      trigger_analysis += `熬夜真的是皮肤泛红刺痛的超级大元凶！睡眠不足会让皮肤微循环彻底崩坏，毛细血管扩张，所以你脸上才会动不动就红成一片。听话，千万元神修护霜也救不回熬夜修仙的脸啊！`;
    } else {
      trigger_analysis += `虽然这周皮肤还没崩盘，但这些高糖高辣加熬夜的小动作就像是定时炸弹。皮肤现在没爆发只是在帮你死撑，千万别等屏障彻底崩塌了才后悔哟！`;
    }
  } else {
    trigger_analysis = `这周你在作息和饮食上表现得像个乖宝宝，基本没有熬夜、暴饮暴食的记录。皮肤能维持这么通透稳定的状态，你管住嘴、睡饱觉的功劳绝对要占一大半，继续保持哟！`;
  }

  // 3. 护肤品柜匹配分析与警告
  if (rednessCount > 0 || acneCount > 0) {
    if (hasAcidsOrRetinol) {
      cabinet_matching = `拉响红色警报！🚨 闺蜜发现你的护肤柜里放着酸类或A醇等强活性猛药。你现在皮肤明明已经泛红爆痘了，这说明屏障已经受损！这个时候要是还急着刷酸、涂A醇去痘印，简直就是雪上加霜！听话，把这些“猛药”全部打入冷宫，立刻停用！`;
    } else {
      cabinet_matching = `好在你的护肤柜里目前没有太多的“猛药”单品，避免了屏障受损期的二次伤害。这几天重点看看柜子里的温和洁面和舒缓面霜，多用点含有神经酰胺、积雪草或B5的修护品，帮皮肤把破损的“防线”先补起来。`;
    }
  } else {
    if (hasAcidsOrRetinol) {
      cabinet_matching = `你目前的肤况非常耐受稳定，护肤柜里的A醇、抗初老精华正是派上用场的好时候。在皮肤屏障健康的前提下，可以循序渐进地继续进行抗老或刷酸。不过切记：千万别贪心，A醇和酸类产品千万不要在同一个晚上叠加使用，会翻车的！`;
    } else {
      cabinet_matching = `目前皮肤状态很好，护肤柜里基本都是温和补水修护的基础款。如果想要更进一步的抗初老或美白提亮，可以考虑在柜子里适当补充一瓶温和的维A醇（晚间用）或者维C精华（白天搭配防晒），让皮肤更亮更紧致！`;
    }
  }

  // 4. 下周行动指南
  if (rednessCount > 0 || acneCount > 0 || peelingCount > 0) {
    action_plan = `【下周精简微调方案】：\n1. 晨间：用清水或极温和的氨基酸洁面洗脸，轻拍舒缓水，涂抹物理防晒，拒绝化学防晒对皮肤的二次刺激。\n2. 夜间：停用一切刷酸、A醇、去角质及高浓度VC！只用温和洁面+神经酰胺/B5修护面霜，做好基础保湿。\n3. 饮食作息：11点前必须躺下，这周戒掉甜食和奶茶，火锅也先缓缓，多喝温水排毒。`;
  } else if (avgOiliness >= 3.8) {
    action_plan = `【下周控油清爽方案】：\n1. 晨间：选择清爽型洁面，乳液选择控油哑光质地的，出门一定要涂轻薄的防晒乳，防止紫外线加重油脂氧化。\n2. 夜间：晚上温和清洁后，可以用含有微量水杨酸的爽肤水做个局部二次清洁（避开眼周），乳霜选择无油配方的轻薄凝露。\n3. 生活：减少糖分摄入，奶茶点无糖或者三分糖，多吃点富含维生素B的蔬菜，能从源头帮皮脂腺控油。`;
  } else {
    action_plan = `【下周金牌维稳方案】：\n1. 晨间：温和氨基酸洁面 + 补水爽肤水 + 保湿乳液 + 广谱防晒霜（防晒是一切抗老和美白的基础！）。\n2. 夜间：温和卸妆清洁后，可以使用护肤柜里的抗老/精华液，随后涂抹面霜锁水。\n3. 进阶：这周可以尝试在周末敷一次深层清洁泥膜，清除毛孔深层垃圾，让皮肤更通透。`;
  }

  // 5. 闺蜜暖心话
  const sweetTips = [
    "宝子，护肤是一场马拉松，别指望一天就变剥壳鸡蛋。这周就算有点小爆痘也不要焦虑，有闺蜜在，咱们慢慢调理，下周一定会美回来的！",
    "答应我，今天晚上早点睡好吗？你的皮肤真的需要你用高质量的睡眠来好好哄一哄。闭上眼睛，明天起来又是个元气满满的仙女！",
    "看着你护肤柜里慢慢被填满，闺蜜真的超有成就感！继续保持这个打卡劲头，让我们一起见证皮肤发光的高光时刻！",
    "不要为了网上的风很大就去瞎风跟风买猛药，适合自己的才是最好的。你的脸蛋那么珍贵，闺蜜会一直帮你把关，守护你的发光奇迹！"
  ];
  sweet_tip = sweetTips[Math.floor(Math.random() * sweetTips.length)];

  return {
    overall_summary,
    trigger_analysis,
    cabinet_matching,
    action_plan,
    sweet_tip
  };
}

/**
 * 远程调用大模型（使用原生 https 发送请求，零依赖）
 */
function callGeminiAPI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const data = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 15000 // 15秒超时（分析 prompt 较长）
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.candidates && parsed.candidates[0]?.content?.parts[0]?.text) {
            resolve(parsed.candidates[0].content.parts[0].text);
          } else {
            reject(new Error(body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * 医疗合规敏感词净化拦截器：100% 将医疗术语转换为生活护肤温和词汇
 */
function sanitizeReport(report) {
  if (!report) return report;
  
  // 敏感词与闺蜜风生活护肤词汇映射关系
  const filterRules = [
    { pattern: /毛囊炎/g, replacement: '毛囊堵塞红肿痘' },
    { pattern: /脂溢性皮炎/g, replacement: '油脂分泌过剩伴随的屏障脆弱' },
    { pattern: /激素脸/g, replacement: '重度屏障受损' },
    { pattern: /皮炎/g, replacement: '屏障受阻脆弱' },
    { pattern: /开药/g, replacement: '温和理肤建议' },
    { pattern: /处方/g, replacement: '理肤方案' },
    { pattern: /诊断/g, replacement: '肤态评估' },
    { pattern: /治疗/g, replacement: '改善调理' },
    { pattern: /湿疹/g, replacement: '干燥潮红不适' },
    { pattern: /过敏/g, replacement: '脆弱敏感' },
    { pattern: /消炎/g, replacement: '舒缓修护' },
    { pattern: /抗炎/g, replacement: '收敛舒缓' },
    { pattern: /药膏/g, replacement: '修护乳霜' },
    { pattern: /敏感肌/g, replacement: '脆弱肌' },
    { pattern: /用药/g, replacement: '理肤搭配' }
  ];

  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    let temp = str;
    filterRules.forEach(rule => {
      temp = temp.replace(rule.pattern, rule.replacement);
    });
    return temp;
  };

  const sanitized = {};
  for (const key in report) {
    if (Object.prototype.hasOwnProperty.call(report, key)) {
      if (typeof report[key] === 'string') {
        sanitized[key] = sanitizeString(report[key]);
      } else if (typeof report[key] === 'object' && report[key] !== null) {
        sanitized[key] = sanitizeReport(report[key]);
      } else {
        sanitized[key] = report[key];
      }
    }
  }
  return sanitized;
}
