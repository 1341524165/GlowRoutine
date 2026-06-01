const { generateSteps } = require('./routineEngine');

console.log('🧪 开始运行 routineEngine 规则决策树引擎单元测试...\n');

// 测试用例 1：极敏感/泛红警报期测试
function testSevereRedAlert() {
  const profile = {
    skin_type: 'combination',
    sensitivity: 'severe',
    goals: ['anti_aging', 'hydrate']
  };
  
  // 即使 profile 不是 severe，但 isRedAlert = true 也应该触发保护
  const result1 = generateSteps(profile, true);
  
  console.assert(result1.banList.includes('retinol'), '❌ 测试失败: 泛红警报期应该禁用 Retinol');
  console.assert(result1.banList.includes('acid'), '❌ 测试失败: 泛红警报期应该禁用酸类');
  console.assert(result1.banList.includes('exfoliator'), '❌ 测试失败: 泛红警报期应该禁用去角质');
  
  // 检查是否包含物理防晒与修护霜
  const hasPhysicalSunscreen = result1.morning.some(x => x.requirement.includes('物理防晒'));
  const hasBarrierCream = result1.evening.some(x => x.requirement.includes('屏障修护'));
  
  console.assert(hasPhysicalSunscreen, '❌ 测试失败: 敏感/警报期晨间应该推荐物理防晒');
  console.assert(hasBarrierCream, '❌ 测试失败: 敏感/警报期晚间应该推荐屏障修护霜');
  
  // 检查是否不包含A醇精华步骤
  const hasRetinolStep = result1.evening.some(x => x.requirement.includes('A醇'));
  console.assert(!hasRetinolStep, '❌ 测试失败: 敏感/警报期晚间不能包含A醇步骤');
  
  console.log('✅ 测试用例 1 (极度敏感/泛红警报保护) 通过！');
}

// 测试用例 2：常规肤质抗初老与补水测试
function testRegularAntiAgingHydrate() {
  const profile = {
    skin_type: 'dry',
    sensitivity: 'stable',
    goals: ['anti_aging', 'hydrate']
  };
  
  const result2 = generateSteps(profile, false);
  
  console.assert(result2.banList.length === 0, '❌ 测试失败: 稳定肤质常规期不应有禁用成分');
  
  // 检查晨间是否包含保湿精华
  const hasHydrateEssence = result2.morning.some(x => x.requirement.includes('保湿精华'));
  console.assert(hasHydrateEssence, '❌ 测试失败: 补水目标晨间应推荐深层保湿精华');
  
  // 检查晚间是否包含抗初老A醇精华
  const hasRetinolEssence = result2.evening.some(x => x.requirement.includes('A醇精华'));
  console.assert(hasRetinolEssence, '❌ 测试失败: 抗初老目标且耐受良好肤质晚间应推荐抗初老A醇精华');
  
  // 检查晚间是否包含保湿面霜
  const hasHydrateCream = result2.evening.some(x => x.requirement.includes('锁水面霜') || x.requirement.includes('保湿面霜'));
  console.assert(hasHydrateCream, '❌ 测试失败: 晚间应包含锁水/保湿面霜');

  console.log('✅ 测试用例 2 (常规稳定抗衰补水) 通过！');
}

// 测试用例 3：中度敏感控油测试
function testModerateOilControl() {
  const profile = {
    skin_type: 'oily',
    sensitivity: 'moderate',
    goals: ['oil_control', 'barrier']
  };
  
  const result3 = generateSteps(profile, false);
  
  // 检查晨间是否包含控油洁面与控油精华
  const hasOilControlCleanser = result3.morning.some(x => x.requirement.includes('控油洁面'));
  const hasOilControlEssence = result3.morning.some(x => x.requirement.includes('控油精华'));
  
  console.assert(hasOilControlCleanser, '❌ 测试失败: 控油目标晨间应使用清爽控油洁面');
  console.assert(hasOilControlEssence, '❌ 测试失败: 控油目标晨间应使用清爽控油精华');
  
  // 检查晚间是否包含屏障舒缓精华与修护晚霜
  const hasBarrierEssence = result3.evening.some(x => x.requirement.includes('屏障舒缓精华'));
  const hasBarrierCream = result3.evening.some(x => x.requirement.includes('修护晚霜'));
  
  console.assert(hasBarrierEssence, '❌ 测试失败: 屏障修护目标晚间应使用屏障舒缓精华');
  console.assert(hasBarrierCream, '❌ 测试失败: 屏障修护目标晚间应使用屏障修护晚霜');
  
  // 警示语应为中度敏感提示
  console.assert(result3.alertMsg.includes('泛红泛酸'), '❌ 测试失败: 中度敏感肌应提示泛红泛酸建议');

  console.log('✅ 测试用例 3 (中度敏感控油屏障修护) 通过！');
}

try {
  testSevereRedAlert();
  testRegularAntiAgingHydrate();
  testModerateOilControl();
  console.log('\n🎉 所有 routineEngine 规则决策树引擎单元测试全部顺利通过！');
} catch (error) {
  console.error('\n❌ 单元测试运行发生异常错误:', error);
  process.exit(1);
}
