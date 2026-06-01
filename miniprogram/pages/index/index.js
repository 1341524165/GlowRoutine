const { generateSteps } = require('../../utils/routineEngine');
const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');

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
    todayDate: ''
  },

  onLoad() {
    this.setFormattedDate();
  },

  onShow() {
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
    if (stepName === "精华" && prodCat === "essence") return true;
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
        return {
          ...step,
          completed: false, // Default checkbox status
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
    
    wx.showLoading({ title: '正在打卡登记...' });

    const checkInData = {
      date: new Date().toISOString().split('T')[0],
      active_tab: this.data.activeTab,
      completed_steps: completedSteps,
      is_red_alert: this.data.isRedAlert,
      ratings: {
        oiliness: 3, // Default fallback rating
        redness: this.data.isRedAlert,
        acne: false
      },
      triggers: [],
      ai_analyzed: false,
      created_at: new Date()
    };

    const saved = localData.addSkinDiary(checkInData);

    wx.hideLoading();
    wx.showToast({
      title: '本地打卡成功',
      icon: 'success',
      duration: 1500
    });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/diary/diary' });
    }, 1500);

    // Asynchronously try cloud database saving
    if (wx.cloud) {
      const db = wx.cloud.database();
      db.collection('skin_diary').add({
        data: saved
      }).then(res => {
        if (res && res._id) {
          localData.updateSkinDiary(saved._id, {
            cloud_id: res._id,
            sync_status: 'synced',
            synced_at: new Date().toISOString()
          });
        }
      }).catch(err => {
        console.warn('Failed to upload check-in data to cloud', err);
      });
    }
  }
});
