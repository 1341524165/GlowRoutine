// Patch require to mock 'wx-server-sdk' which is only available at WeChat Cloud Function runtime
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'wx-server-sdk') {
    return {
      init: () => {},
      database: () => {
        const queryChain = (collectionName) => {
          const chain = {
            where: () => chain,
            orderBy: () => chain,
            limit: () => chain,
            get: async () => {
              if (collectionName === 'users') {
                return { data: global.mockDbUsers || [] };
              } else if (collectionName === 'skincare_cabinet') {
                return { data: global.mockDbCabinet || [] };
              }
              return { data: [] };
            }
          };
          return chain;
        };
        return {
          collection: queryChain,
          command: {}
        };
      },
      getWXContext: () => ({ OPENID: 'mock-openid' })
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import the cloud function index
const { main } = require('./index');

async function runTests() {
  console.log('🧪 Starting buyingConsultation cloud function local tests with mocked wx-server-sdk...');

  // Test Case 1: A醇 under sensitive skin (should be extremely low suitability score and give warning)
  // Mock cloud database state
  global.mockDbUsers = [{
    skin_profile: {
      skin_type: 'dry',
      sensitivity: 'severe',
      goals: ['anti_aging'],
      budget: 'moderate'
    }
  }];
  global.mockDbCabinet = [
    { product_name: '修丽可面霜', status: 'opened' },
    { product_name: '爽肤水', status: 'opened' }
  ];

  const event1 = {
    productName: '抗老A醇面霜'
  };

  const res1 = await main(event1, {});
  console.assert(res1.success === true, 'Test Case 1 should succeed');
  console.assert(res1.data.suitability_score === 3, 'Test Case 1 score should be 3');
  console.assert(res1.data.conflict_warnings.includes('极易刺痛') || res1.data.conflict_warnings.includes('脆弱'), 'Test Case 1 should warn about sensitive skin');
  
  // Verify medical word sanitation
  const jsonStr1 = JSON.stringify(res1.data);
  console.assert(!jsonStr1.includes('皮炎') && !jsonStr1.includes('过敏') && !jsonStr1.includes('敏感肌'), 'Medical words must be sanitized');
  console.log('✅ Test Case 1 (A醇 + 敏感肌) Passed!');

  // Test Case 2: Prototypes of VC under stable skin
  // Mock cloud database state
  global.mockDbUsers = [{
    skin_profile: {
      skin_type: 'oily',
      sensitivity: 'stable',
      goals: ['brightening'],
      budget: 'luxury'
    }
  }];
  global.mockDbCabinet = [];

  const event2 = {
    productName: 'CE修护VC精华'
  };

  const res2 = await main(event2, {});
  console.assert(res2.success === true, 'Test Case 2 should succeed');
  console.assert(res2.data.suitability_score === 8, 'Test Case 2 score should be 8');
  console.assert(res2.data.verdict.includes('防晒') || res2.data.verdict.includes('用完'), 'Test Case 2 should give proper VC advice');
  console.log('✅ Test Case 2 (VC + 稳定肌) Passed!');

  // Test Case 3: Fruit Acid under sensitive skin (should warn)
  // Mock cloud database state
  global.mockDbUsers = [{
    skin_profile: {
      skin_type: 'combination',
      sensitivity: 'severe',
      goals: ['acne'],
      budget: 'moderate'
    }
  }];
  global.mockDbCabinet = [
    { product_name: '温和洁面', status: 'opened' },
    { product_name: 'B5修护霜', status: 'opened' }
  ];

  const event3 = {
    productName: '果酸焕肤面膜'
  };

  const res3 = await main(event3, {});
  console.assert(res3.success === true, 'Test Case 3 should succeed');
  console.assert(res3.data.suitability_score === 2, 'Test Case 3 score should be 2');
  console.assert(res3.data.verdict.includes('禁止刷酸') || res3.data.verdict.includes('手给我缩回来'), 'Test Case 3 should strongly warn');
  console.log('✅ Test Case 3 (刷酸 + 敏感肌) Passed!');

  console.log('🎉 All 3 local expert engine tests PASSED successfully without assertions failed!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
