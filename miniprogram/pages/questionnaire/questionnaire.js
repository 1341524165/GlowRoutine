Page({
  data: {
    skinType: '',
    sensitivity: '',
    goalsMap: {
      hydrate: false,
      oil_control: false,
      acne_marks: false,
      anti_aging: false,
      barrier: false
    }
  },

  onLoad() {
    // If there is already a skin profile, load it to pre-fill
    try {
      const profile = wx.getStorageSync('skin_profile');
      if (profile) {
        const goalsMap = {
          hydrate: false,
          oil_control: false,
          acne_marks: false,
          anti_aging: false,
          barrier: false
        };
        if (profile.goals && Array.isArray(profile.goals)) {
          profile.goals.forEach(goal => {
            if (goalsMap[goal] !== undefined) {
              goalsMap[goal] = true;
            }
          });
        }
        this.setData({
          skinType: profile.skin_type || '',
          sensitivity: profile.sensitivity || '',
          goalsMap
        });
      }
    } catch (e) {
      console.error('Failed to load cached skin profile', e);
    }
  },

  selectSkinType(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ skinType: value });
  },

  selectSensitivity(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ sensitivity: value });
  },

  toggleGoal(e) {
    const value = e.currentTarget.dataset.value;
    const goalsMap = { ...this.data.goalsMap };
    goalsMap[value] = !goalsMap[value];
    this.setData({ goalsMap });
  },

  onSubmit() {
    const { skinType, sensitivity, goalsMap } = this.data;
    
    if (!skinType) {
      wx.showToast({ title: '请选择日常肤感', icon: 'none' });
      return;
    }
    if (!sensitivity) {
      wx.showToast({ title: '请选择敏感程度', icon: 'none' });
      return;
    }

    // Extract selected goals
    const goals = Object.keys(goalsMap).filter(key => goalsMap[key]);
    
    if (goals.length === 0) {
      wx.showToast({ title: '请选择至少一个护肤目标', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在定制方案...' });

    const skinProfile = {
      skin_type: skinType,
      sensitivity: sensitivity,
      goals: goals,
      budget: 'moderate',
      is_period_sensitive: false
    };

    // Save locally immediately as a fallback and for routing
    try {
      wx.setStorageSync('skin_profile', skinProfile);
      wx.setStorageSync('has_skin_profile', true);
    } catch (e) {
      console.error('Failed to save profile to storage', e);
    }

    // Try cloud base database synchronization
    if (wx.cloud) {
      const db = wx.cloud.database();
      db.collection('users').add({
        data: {
          skin_profile: skinProfile,
          created_at: new Date()
        }
      }).then(res => {
        console.log('Successfully synced skin profile to cloud db', res);
        wx.hideLoading();
        wx.showToast({
          title: '方案定制成功！',
          icon: 'success',
          duration: 1200
        });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1200);
      }).catch(err => {
        console.error('Failed to sync to cloud database, proceeding with local fallback', err);
        wx.hideLoading();
        wx.showToast({
          title: '方案已保存在本地',
          icon: 'success',
          duration: 1200
        });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1200);
      });
    } else {
      wx.hideLoading();
      wx.showToast({
        title: '方案已保存在本地',
        icon: 'success',
        duration: 1200
      });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1200);
    }
  }
});
