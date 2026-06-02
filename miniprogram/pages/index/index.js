const { generateSteps } = require('../../utils/routineEngine');
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');

Page({
  data: {
    activeTab: 'morning',
    isRedAlert: false,
    alertMessage: '',
    currentSteps: [],
    fullSteps: { morning: [], evening: [] },
    skinProfile: null,
    skinTypeChinese: '加载中...',
    sensitivityChinese: '',
    todayDate: '',
    showDrawer: false,
    isDetailed: false,
    oiliness: 3,
    statusOptions: [
      { name: '🔴 泛红', value: 'redness', checked: false },
      { name: '🌋 爆痘', value: 'acne', checked: false },
      { name: '🍂 脱皮', value: 'peeling', checked: false }
    ],
    triggerOptions: [
      { name: '熬夜', value: 'stay_up', checked: false },
      { name: '辣食/火锅', value: 'spicy', checked: false },
      { name: '甜食/奶茶', value: 'sugar', checked: false }
    ],
    photoPath: '',
    completedStepsText: ''
  },

  onLoad() {
    this.setFormattedDate();
  },

  onShow() {
    const isRedAlert = wx.getStorageSync('is_red_alert') || false;
    this.setData({ isRedAlert });
    
    const profile = localData.getSkinProfile();
    if (!profile) {
      wx.navigateTo({
        url: '/pages/questionnaire/questionnaire'
      });
      return;
    }

    this.loadProfileAndRoutine();
  },

  setFormattedDate() {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayName = days[now.getDay()];
    this.setData({
      todayDate: `${year}年${month}月${date}日 ${dayName}`
    });
  },

  // Map database categories to step names
  isCategoryMatch(prodCat, stepName) {
    if (stepName === "洁面" && prodCat === "cleanser") return true;
    if (stepName === "爽肤" && prodCat === "toner") return true;
    if (stepName === "精华" && (prodCat === "essence" || prodCat === "active")) return true;
    if (stepName === "乳霜" && prodCat === "cream") return true;
    if (stepName === "防晒" && prodCat === "sunscreen") return true;
    return false;
  },

  loadProfileAndRoutine() {
    const profile = localData.getSkinProfile();
    const cabinetList = localData.getCabinetProducts().filter(item => item.status === 'opened');

    const typeMap = {
      oily: '偏油肌',
      dry: '偏干肌',
      combination: '混合肌',
      unknown: '未知肤质'
    };

    const sensMap = {
      severe: '易刺痛敏肌',
      moderate: '偶尔泛红肌',
      stable: '强韧耐受肌'
    };

    this.setData({
      skinProfile: profile,
      skinTypeChinese: typeMap[profile.skin_type] || '定制肤质',
      sensitivityChinese: sensMap[profile.sensitivity] || ''
    });

    this.generateAndMapSteps(profile, cabinetList);

    const entitlement = localData.getEntitlementState();
    if (entitlementRules.canSync(entitlement) && wx.cloud) {
      try {
        const db = wx.cloud.database();
        db.collection('skincare_cabinet').where({ status: 'opened' }).get().then(res => {
          localData.mergeCabinetProducts(res.data || []);
          this.generateAndMapSteps(profile, localData.getCabinetProducts().filter(item => item.status === 'opened'));
        }).catch(err => {
          console.warn('Cloud cabinet merge skipped:', err);
        });
      } catch (e) {
        console.warn('Cloud cabinet merge unavailable:', e);
      }
    }
  },

  generateAndMapSteps(profile, cabinet) {
    if (!profile) return;

    // Run decision rules engine
    const routine = generateSteps(profile, this.data.isRedAlert);

    // Map cabinet products to morning and evening steps
    const mapProductToSteps = (steps) => {
      return steps.map(step => {
        const matched = cabinet.find(prod => this.isCategoryMatch(prod.category, step.step));
        const hasConflict = matched && matched.ingredients && (matched.ingredients.includes('A醇') || matched.ingredients.includes('酸类'));
        const isDisabled = this.data.isRedAlert && hasConflict;
        return {
          ...step,
          completed: false, // Default checkbox status
          disabled: isDisabled,
          requirement: isDisabled ? `🚫 ${step.requirement} (敏感期禁用猛药)` : step.requirement,
          mappedProduct: matched || null
        };
      });
    };

    const morningMapped = mapProductToSteps(routine.morning);
    const eveningMapped = mapProductToSteps(routine.evening);

    this.setData({
      alertMessage: routine.alertMsg,
      fullSteps: {
        morning: morningMapped,
        evening: eveningMapped
      },
      currentSteps: this.data.activeTab === 'morning' ? morningMapped : eveningMapped
    });
  },

  // Toggle single step completion
  toggleStepCompletion(e) {
    const index = e.currentTarget.dataset.index;
    const currentSteps = [...this.data.currentSteps];
    
    if (currentSteps[index].disabled) {
      wx.showModal({
        title: '敏感期警告 🚨',
        content: '宝子，听闺蜜的！今日皮肤处于泛红警报状态，这瓶含有 A醇/酸类 的猛药绝对不能用，会给屏障带来二次伤害哦！建议把该步骤换成温和修护水乳！🛡️',
        showCancel: false,
        confirmColor: '#E8A08A'
      });
      return;
    }

    currentSteps[index].completed = !currentSteps[index].completed;

    const activeTab = this.data.activeTab;
    const fullSteps = { ...this.data.fullSteps };
    fullSteps[activeTab] = currentSteps;

    this.setData({
      currentSteps,
      fullSteps
    });
  },

  onRedAlertToggle(e) {
    const isRedAlert = e.detail.value;
    wx.setStorageSync('is_red_alert', isRedAlert);
    this.setData({ isRedAlert }, () => {
      // Re-trigger routine generation and mapping with cabinet
      this.loadProfileAndRoutine();
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;

    this.setData({
      activeTab: tab,
      currentSteps: this.data.fullSteps[tab]
    });
  },

  onDisclaimerAgreed() {
    console.log('User agreed to health safety disclaimer.');
  },

  goToQuestionnaire() {
    wx.navigateTo({
      url: '/pages/questionnaire/questionnaire'
    });
  },

  goToCabinet() {
    wx.switchTab({
      url: '/pages/cabinet/cabinet'
    });
  },

  onCheckIn() {
    const completedSteps = this.data.currentSteps.filter(x => x.completed).map(x => x.step);
    this.setData({
      completedStepsText: completedSteps.join('、') || '无',
      showDrawer: true,
      isDetailed: false, // 默认显示极简模式
      photoPath: '',
      oiliness: 3,
      statusOptions: [
        { name: '🔴 泛红', value: 'redness', checked: false },
        { name: '🌋 爆痘', value: 'acne', checked: false },
        { name: '🍂 脱皮', value: 'peeling', checked: false }
      ],
      triggerOptions: [
        { name: '熬夜', value: 'stay_up', checked: false },
        { name: '辣食/火锅', value: 'spicy', checked: false },
        { name: '甜食/奶茶', value: 'sugar', checked: false }
      ]
    });
  },

  closeDrawer() {
    this.setData({
      showDrawer: false
    });
  },

  toggleDetailed() {
    this.setData({
      isDetailed: !this.data.isDetailed
    });
  },

  onOilChange(e) {
    this.setData({
      oiliness: e.detail.value
    });
  },

  onStatusChange(e) {
    const values = e.detail.value;
    const statusOptions = this.data.statusOptions.map(item => {
      return {
        ...item,
        checked: values.includes(item.value)
      };
    });
    this.setData({
      statusOptions
    });
  },

  onTriggersChange(e) {
    const values = e.detail.value;
    const triggerOptions = this.data.triggerOptions.map(item => {
      return {
        ...item,
        checked: values.includes(item.value)
      };
    });
    this.setData({
      triggerOptions
    });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'front', // 默认前置摄像头，方便素颜自拍
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          photoPath: tempFilePath
        });
      },
      fail: (err) => {
        console.warn('Choose media failed:', err);
      }
    });
  },

  uploadPhotoToCloud(localDiaryId) {
    return new Promise(resolve => {
      if (!this.data.photoPath) {
        resolve('');
        return;
      }

      const entitlement = localData.getEntitlementState();
      const retention = entitlementRules.getCloudPhotoRetention(entitlement);
      const cloudPhotos = localData.getSkinDiaries().filter(item => item.cloud_file_id);
      const prompt = entitlementRules.getThresholdPrompt('cloud_photo_retention', cloudPhotos.length, retention, entitlement);

      if (prompt.level === 'at_threshold') {
        wx.showToast({ title: '云照片空间已满，本次仅保存在本地', icon: 'none' });
        resolve('');
        return;
      }
      if (prompt.level === 'near_threshold') {
        wx.showToast({ title: '云照片空间快满了', icon: 'none' });
      }

      const filePath = this.data.photoPath;
      const cloudPath = `skin_diaries/${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`;
      cloudEnhancements.uploadFileSafe(cloudPath, filePath).then(result => {
        if (result.ok) {
          localData.updateSkinDiary(localDiaryId, {
            cloud_file_id: result.data,
            photo_path: result.data,
            photo_sync_status: 'synced'
          });
          resolve(result.data);
        } else {
          localData.updateSkinDiary(localDiaryId, {
            photo_sync_status: 'failed',
            sync_error: result.error
          });
          wx.showToast({ title: '照片上传失败，日记已本地保存', icon: 'none' });
          resolve('');
        }
      });
    });
  },

  saveMinimalCheckIn() {
    const completedSteps = this.data.currentSteps.filter(x => x.completed).map(x => x.step);
    
    wx.showLoading({ title: '正在打卡登记...' });

    const checkInData = {
      date: new Date().toISOString().split('T')[0],
      active_tab: this.data.activeTab,
      completed_steps: completedSteps,
      is_red_alert: this.data.isRedAlert,
      ratings: {
        oiliness: 3, // Standard oiliness
        redness: this.data.isRedAlert ? 5 : 1,
        acne: 1,
        peeling: 1
      },
      statuses: this.data.isRedAlert ? ['red', 'redness'] : [],
      triggers: [],
      ai_analyzed: false,
      created_at: new Date().toISOString()
    };

    const saved = localData.addSkinDiary(checkInData);

    wx.hideLoading();
    wx.showToast({
      title: '极简打卡成功',
      icon: 'success',
      duration: 1500
    });
    
    this.setData({
      showDrawer: false
    });
    
    setTimeout(() => {
      wx.switchTab({ url: '/pages/diary/diary' });
    }, 1500);

    // Asynchronously try cloud database saving using safe wrapper
    const cloudPayload = {
      ...saved,
      created_at: new Date(saved.created_at)
    };
    cloudEnhancements.addDocumentSafe('skin_diary', cloudPayload).then(result => {
      if (result.ok && result.data && result.data._id) {
        localData.updateSkinDiaryId(saved._id, result.data._id, {
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
      } else if (!result.ok) {
        console.warn('Failed to upload check-in data to cloud:', result.error);
        localData.updateSkinDiary(saved._id, {
          sync_status: 'pending',
          sync_error: result.error
        });
      }
    });
  },

  saveDetailedCheckIn() {
    const completedSteps = this.data.currentSteps.filter(x => x.completed).map(x => x.step);
    
    wx.showLoading({ title: '正在保存日记...' });

    const activeTriggers = this.data.triggerOptions
      .filter(t => t.checked)
      .map(t => t.value);

    const isRednessChecked = this.data.statusOptions.find(s => s.value === 'redness')?.checked || false;
    const isAcneChecked = this.data.statusOptions.find(s => s.value === 'acne')?.checked || false;
    const isPeelingChecked = this.data.statusOptions.find(s => s.value === 'peeling')?.checked || false;

    const localDiary = localData.addSkinDiary({
      date: new Date().toISOString().split('T')[0],
      active_tab: this.data.activeTab,
      completed_steps: completedSteps,
      is_red_alert: this.data.isRedAlert,
      ratings: {
        oiliness: this.data.oiliness,
        redness: isRednessChecked ? 5 : (this.data.isRedAlert ? 5 : 1),
        acne: isAcneChecked ? 5 : 1,
        peeling: isPeelingChecked ? 5 : 1
      },
      statuses: [
        ...(isRednessChecked ? ['red', 'redness'] : (this.data.isRedAlert ? ['red', 'redness'] : [])),
        ...(isAcneChecked ? ['acne'] : []),
        ...(isPeelingChecked ? ['peel', 'peeling'] : [])
      ],
      triggers: activeTriggers,
      local_photo_path: this.data.photoPath,
      created_at: new Date().toISOString()
    });

    wx.hideLoading();
    wx.showToast({
      title: '日记打卡已保存！',
      icon: 'success',
      duration: 1500
    });

    this.setData({
      showDrawer: false
    });

    setTimeout(() => {
      wx.switchTab({ url: '/pages/diary/diary' });
    }, 1500);

    // Asynchronously upload photo and save to cloud
    this.uploadPhotoToCloud(localDiary._id).then(cloudPhotoPath => {
      const cloudPayload = {
        ...localDiary,
        photo_path: cloudPhotoPath,
        cloud_file_id: cloudPhotoPath,
        created_at: new Date(localDiary.created_at)
      };

      cloudEnhancements.addDocumentSafe('skin_diary', cloudPayload).then(result => {
        if (result.ok && result.data && result.data._id) {
          localData.updateSkinDiaryId(localDiary._id, result.data._id, {
            sync_status: 'synced',
            synced_at: new Date().toISOString()
          });
        } else if (!result.ok) {
          console.warn('Failed to upload detailed check-in data to cloud:', result.error);
          localData.updateSkinDiary(localDiary._id, {
            sync_status: 'pending',
            sync_error: result.error
          });
        }
      });
    });
  }
});
