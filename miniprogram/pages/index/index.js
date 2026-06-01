const { generateSteps } = require('../../utils/routineEngine');

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
    // 1. Verify if user skin profile exists
    const hasProfile = wx.getStorageSync('has_skin_profile');
    if (!hasProfile) {
      wx.navigateTo({
        url: '/pages/questionnaire/questionnaire'
      });
      return;
    }

    // 2. Load profile and routine matching
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
    // Obtain cached skin profile first as robust fallback
    let profile = null;
    try {
      profile = wx.getStorageSync('skin_profile');
    } catch (e) {
      console.error('Failed to get cached skin profile', e);
    }

    // Translate skin types & sensitivities to Chinese display names
    const updateDisplayNames = (p) => {
      if (!p) return;
      
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
        skinProfile: p,
        skinTypeChinese: typeMap[p.skin_type] || '定制肤质',
        sensitivityChinese: sensMap[p.sensitivity] || ''
      });
    };

    if (profile) {
      updateDisplayNames(profile);
    }

    // Prepare robust loading of cabinet products
    const loadFromCabinet = (finalProfile) => {
      let cabinetList = [];
      let cloudLoadedCabinet = false;
      
      // Attempt cloud load first
      if (wx.cloud) {
        try {
          const db = wx.cloud.database();
          db.collection('skincare_cabinet').where({
            status: 'opened'
          }).get().then(cabRes => {
            cabinetList = cabRes.data;
            this.generateAndMapSteps(finalProfile, cabinetList);
          }).catch(err => {
            console.warn('Failed to load cabinet from cloud db, falling back to local cache', err);
            cabinetList = wx.getStorageSync('skincare_cabinet') || [];
            const openedCabinetList = cabinetList.filter(item => item.status === 'opened');
            this.generateAndMapSteps(finalProfile, openedCabinetList);
          });
          cloudLoadedCabinet = true;
        } catch (e) {
          console.warn('Cloud database init failed for cabinet, using local cache', e);
        }
      }
      
      if (!cloudLoadedCabinet) {
        cabinetList = wx.getStorageSync('skincare_cabinet') || [];
        const openedCabinetList = cabinetList.filter(item => item.status === 'opened');
        this.generateAndMapSteps(finalProfile, openedCabinetList);
      }
    };

    // Try cloud loading of skin profile
    let cloudLoadedProfile = false;
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();
        db.collection('users').orderBy('created_at', 'desc').limit(1).get().then(res => {
          if (res.data && res.data.length > 0 && res.data[0].skin_profile) {
            const cloudProfile = res.data[0].skin_profile;
            // Sync back to local storage just in case
            wx.setStorageSync('skin_profile', cloudProfile);
            updateDisplayNames(cloudProfile);
            loadFromCabinet(cloudProfile);
          } else {
            // Cloud empty, use local
            loadFromCabinet(profile);
          }
        }).catch(err => {
          console.warn('Failed to fetch profile from cloud database, using cached', err);
          loadFromCabinet(profile);
        });
        cloudLoadedProfile = true;
      } catch (e) {
        console.warn('Cloud database init failed for skin profile, using cached', e);
      }
    }
    
    if (!cloudLoadedProfile) {
      loadFromCabinet(profile);
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

    // Save locally first
    try {
      const logs = wx.getStorageSync('skin_diary_logs') || [];
      logs.unshift(checkInData);
      wx.setStorageSync('skin_diary_logs', logs);
    } catch (e) {
      console.error('Failed to save check-in data locally', e);
    }

    // Try cloud database saving
    if (wx.cloud) {
      const db = wx.cloud.database();
      db.collection('skin_diary').add({
        data: checkInData
      }).then(res => {
        wx.hideLoading();
        wx.showToast({
          title: '打卡成功！',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/diary/diary' });
        }, 1500);
      }).catch(err => {
        console.warn('Failed to upload check-in data, saved locally', err);
        wx.hideLoading();
        wx.showToast({
          title: '本地打卡成功',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/diary/diary' });
        }, 1500);
      });
    } else {
      wx.hideLoading();
      wx.showToast({
        title: '本地打卡成功',
        icon: 'success',
        duration: 1500
      });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/diary/diary' });
      }, 1500);
    }
  }
});
