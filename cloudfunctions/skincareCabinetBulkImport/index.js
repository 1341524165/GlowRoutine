const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { text } = event;
  if (!text || !text.trim()) {
    return { success: false, error: '输入文本不能为空' };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  let parsedData = null;

  if (GEMINI_API_KEY) {
    try {
      const resultText = await callGeminiLLM(GEMINI_API_KEY, text);
      let cleanJson = resultText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/, '');
      }
      parsedData = JSON.parse(cleanJson);
    } catch (err) {
      console.error('LLM parse failed, fallback to regex:', err);
    }
  }

  if (!parsedData) {
    // 本地正则切割兜底
    parsedData = text.split(/[\n,，;；、]/).map(line => {
      const name = line.replace(/^\d+[\.\s、\-]+/g, '').trim();
      if (!name) return null;
      let category = 'essence';
      let ingredients = [];
      if (name.includes('洁面') || name.includes('洗面')) category = 'cleanser';
      else if (name.includes('水') || name.includes('露')) category = 'toner';
      else if (name.includes('霜') || name.includes('乳')) category = 'cream';
      else if (name.includes('防晒')) category = 'sunscreen';
      
      if (name.includes('B5') || name.includes('修护')) ingredients.push('B5');
      if (name.includes('酸')) ingredients.push('酸类');
      if (name.includes('醇') || name.includes('A醇')) ingredients.push('A醇');
      if (name.includes('玻尿酸')) ingredients.push('玻尿酸');

      return { product_name: name, category, pao_months: 12, ingredients };
    }).filter(Boolean);
  }

  return { success: true, data: parsedData };
};

function callGeminiLLM(apiKey, text) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const data = JSON.stringify({
      contents: [{
        parts: [{
          text: `你是一个护肤品包装与配方专家。请仔细解析以下用户提供的护肤品杂乱列表文本，提取出清单中出现的每个化妆品：
          必须仅以 JSON 数组格式输出，不要包含任何 markdown 标记 (不要有 \`\`\`json 包装，不要有任何多余前导/后缀字符)：
          - "product_name": 完整的中文产品名称 (例如“理肤泉B5修复面霜”)。
          - "category": 产品分类。必须是以下六个值之一：'cleanser' (洁面), 'toner' (爽肤水), 'essence' (精华), 'cream' (面霜/乳液), 'sunscreen' (防晒), 'active' (活性/A醇/酸类)。若含A醇或高浓度酸，优先归为 'active'。
          - "pao_months": 数字（开封后保质期月数，默认为 12）。
          - "ingredients": 核心成分数组。只能从以下白名单挑选（可多选或为空）：['A醇', '酸类', '烟酰胺', '维C', 'B5', '积雪草', '玻尿酸', '神经酰胺', '酵母']。

          输入清单：
          ${text}`
        }]
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
      timeout: 10000
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

    req.on('error', (e) => { reject(e); });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.write(data);
    req.end();
  });
}
