const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');
const reportFallback = require('../../utils/reportFallback');

Page({
  data: {
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
    cloudPhotoPath: '',
    checkInCount: 0,
    isReportUnlocked: false,
    weeklyReport: null,
    reportTime: '',
    showAdModal: false,
    adCountdown: 15,
    sliderX: 150
  },

  onShow() {
    this.checkUserSession();
    this.loadCheckInStats();
    
    // 检查本地缓存的已解锁报告
    const isUnlocked = wx.getStorageSync('report_unlocked') || false;
    const cachedReport = wx.getStorageSync('last_weekly_report') || null;
    const cachedReportTime = wx.getStorageSync('last_report_time') || '';
    if (isUnlocked && cachedReport) {
      this.setData({
        isReportUnlocked: true,
        weeklyReport: cachedReport,
        reportTime: cachedReportTime
      });
    }
  },

  onReady() {
    this.initCompareCanvas();
  },

  /**
   * 检查用户是否创建了肤况档案
   */
  checkUserSession() {
    const hasProfile = !!localData.getSkinProfile();
    if (!hasProfile) {
      wx.showModal({
        title: '温馨提示',
        content: '亲爱的，请先花2分钟测测你的肤况档案，这样AI闺蜜才能给你科学适配哦！',
        confirmText: '去测肤况',
        cancelText: '先看看',
        confirmColor: '#E8A08A',
        success(res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/questionnaire/questionnaire' });
          }
        }
      });
    }
  },

  /**
   * 加载打卡统计数据并获取对比照路径
   */
  loadCheckInStats() {
    const localLogs = localData.getSkinDiaries();
    const sevenDaysAgoTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const localCount = localLogs.filter(log => {
      const dStr = log.created_at || log.date;
      const logDate = new Date(dStr).getTime();
      return logDate >= sevenDaysAgoTime;
    }).length;

    const photoRecords = localLogs.filter(log => (log.local_photo_path || log.photo_path || log.cloud_file_id));
    let beforeUrl = 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600';
    let afterUrl = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600';

    if (photoRecords.length >= 2) {
      beforeUrl = photoRecords[photoRecords.length - 1].local_photo_path || photoRecords[photoRecords.length - 1].photo_path || photoRecords[photoRecords.length - 1].cloud_file_id;
      afterUrl = photoRecords[0].local_photo_path || photoRecords[0].photo_path || photoRecords[0].cloud_file_id;
    } else if (photoRecords.length === 1) {
      afterUrl = photoRecords[0].local_photo_path || photoRecords[0].photo_path || photoRecords[0].cloud_file_id;
    }

    this.setData({ checkInCount: localCount });
    this.updateCompareImages(beforeUrl, afterUrl);
  },

  /**
   * 30 秒极简打卡表单交互
   */
  onOilChange(e) { this.setData({ oiliness: e.detail.value }); },
  
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
      triggerOptions,
      triggers: values
    });
  },

  /**
   * 选择/拍摄今日肤况素颜照
   */
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
        console.log('选择图片取消或失败', err);
      }
    });
  },

  /**
   * 异步上传照片到微信云开发存储
   */
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

  /**
   * 保存今日日记打卡
   */
  async saveDiary() {
    wx.showLoading({ title: '正在保存日记...' });

    const activeTriggers = this.data.triggerOptions
      .filter(t => t.checked)
      .map(t => t.value);

    const isRednessChecked = this.data.statusOptions.find(s => s.value === 'redness')?.checked || false;
    const isAcneChecked = this.data.statusOptions.find(s => s.value === 'acne')?.checked || false;
    const isPeelingChecked = this.data.statusOptions.find(s => s.value === 'peeling')?.checked || false;

    const localDiary = localData.addSkinDiary({
      date: new Date().toISOString().split('T')[0],
      ratings: {
        oiliness: this.data.oiliness,
        redness: isRednessChecked ? 5 : 1,
        acne: isAcneChecked ? 5 : 1,
        peeling: isPeelingChecked ? 5 : 1
      },
      statuses: [
        ...(isRednessChecked ? ['red', 'redness'] : []),
        ...(isAcneChecked ? ['acne'] : []),
        ...(isPeelingChecked ? ['peel', 'peeling'] : [])
      ],
      triggers: activeTriggers,
      local_photo_path: this.data.photoPath,
      created_at: new Date().toISOString()
    });

    wx.hideLoading();
    wx.showToast({
      title: '今日打卡已保存！',
      icon: 'success',
      duration: 2000
    });

    this.loadCheckInStats();
    this.setData({
      photoPath: '',
      oiliness: 3,
      statusOptions: this.data.statusOptions.map(s => ({ ...s, checked: false })),
      triggerOptions: this.data.triggerOptions.map(t => ({ ...t, checked: false }))
    });

    const cloudPhotoPath = await this.uploadPhotoToCloud(localDiary._id);
    const cloudPayload = {
      ...localDiary,
      photo_path: cloudPhotoPath,
      cloud_file_id: cloudPhotoPath,
      created_at: new Date(localDiary.created_at)
    };
    const result = await cloudEnhancements.addDocumentSafe('skin_diary', cloudPayload);
    if (result.ok && result.data && result.data._id) {
      localData.updateSkinDiary(localDiary._id, {
        cloud_id: result.data._id,
        sync_status: 'synced',
        synced_at: new Date().toISOString()
      });
    } else if (!result.ok) {
      localData.updateSkinDiary(localDiary._id, {
        sync_status: 'pending',
        sync_error: result.error
      });
    }
  },

  /**
   * 初始化 Native Canvas 2D 容器
   */
  initCompareCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#compareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.warn('未找到 Canvas 节点，重试初始化');
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        this.canvas = canvas;
        this.ctx = ctx;
        this.canvasWidth = res[0].width;
        this.canvasHeight = res[0].height;

        // 初始化默认图片
        this.updateCompareImages(
          'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600',
          'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600'
        );
      });
  },

  /**
   * 避坑真传：将云路径或HTTP图片安全转换为小程序本地临时路径
   */
  getImageLocalPath(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve('');
        return;
      }
      if (url.startsWith('cloud://')) {
        wx.cloud.downloadFile({
          fileID: url,
          success: res => resolve(res.tempFilePath),
          fail: err => {
            console.error('云照片下载失败，使用原路径:', err);
            resolve(url);
          }
        });
      } else if (url.startsWith('http')) {
        wx.getImageInfo({
          src: url,
          success: res => resolve(res.path),
          fail: err => {
            console.error('HTTP图片解析失败，直接使用原始链接:', err);
            resolve(url);
          }
        });
      } else {
        resolve(url);
      }
    });
  },

  /**
   * 动态更新 Canvas 中加载的 Before / After 图片
   */
  async updateCompareImages(beforeUrl, afterUrl) {
    if (!this.canvas) return;

    try {
      // 1. 安全转换图片路径
      const localBefore = await this.getImageLocalPath(beforeUrl);
      const localAfter = await this.getImageLocalPath(afterUrl);

      const canvas = this.canvas;
      const imgBefore = canvas.createImage();
      const imgAfter = canvas.createImage();

      imgBefore.src = localBefore;
      imgBefore.onload = () => {
        imgAfter.src = localAfter;
        imgAfter.onload = () => {
          this.imgBefore = imgBefore;
          this.imgAfter = imgAfter;
          this.drawCompare(this.data.sliderX);
        };
      };
    } catch (e) {
      console.error('Canvas 图片对象加载异常:', e);
    }
  },

  /**
   * 裁剪渲染：左 Before，右 After
   */
  drawCompare(x) {
    if (!this.ctx || !this.imgBefore || !this.imgAfter) return;
    
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    ctx.clearRect(0, 0, w, h);
    
    // 1. 绘制右半部分 (After 皮肤图) - 占满底层全屏
    ctx.drawImage(this.imgAfter, 0, 0, w, h);
    
    // 2. 绘制左半部分 (Before 皮肤图) - 精准限制在 [0, x] 裁剪区
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, x, h);
    ctx.clip();
    ctx.drawImage(this.imgBefore, 0, 0, w, h);
    ctx.restore();

    // 3. 绘制中央毛玻璃高亮白边
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // 重置 shadow 状态防后续干扰
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // 4. 绘制精美圆形滑轮
    // 外圆
    ctx.fillStyle = '#E8A08A';
    ctx.beginPath();
    ctx.arc(x, h / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    // 内圆
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
  },

  /**
   * 在 touchstart 时预存 Canvas boundingClientRect
   * 避开在 touchmove 里循环 query，从而保证 60fps 丝滑拖拽
   */
  onCanvasTouchStart(e) {
    const query = wx.createSelectorQuery();
    query.select('#compareCanvas').boundingClientRect((rect) => {
      this.canvasRect = rect;
    }).exec();
  },

  /**
   * 触摸滑动事件实时计算分界线 sliderX 位置
   */
  onCanvasTouch(e) {
    if (!this.canvasRect || !e.touches || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    let x = touch.clientX - this.canvasRect.left;
    
    if (x < 0) x = 0;
    if (x > this.canvasWidth) x = this.canvasWidth;
    
    this.setData({ sliderX: x });
    this.drawCompare(x);
  },

  /**
   * 触发解锁报告：看广告解锁
   */
  watchAdToUnlock() {
    this.setData({
      showAdModal: true,
      adCountdown: 15
    });

    // 开启 15 秒激励视频广告倒计时
    this.adInterval = setInterval(() => {
      let count = this.data.adCountdown - 1;
      if (count <= 0) {
        clearInterval(this.adInterval);
        this.setData({ adCountdown: 0 });
      } else {
        this.setData({ adCountdown: count });
      }
    }, 1000);
  },

  /**
   * 广告播放完成，确认解锁并调用云端分析
   */
  onAdComplete() {
    if (this.data.adCountdown > 0) return; // 广告未播放完，禁用
    
    this.setData({ showAdModal: false });
    wx.showToast({ title: '广告完成！已成功解锁', icon: 'success' });
    this.triggerAnalysis();
  },

  /**
   * 触发解锁报告：会员直接解锁免广告
   */
  directVipUnlock() {
    wx.showLoading({ title: '正在校验会员资格...' });
    
    // 模拟 1 秒网络请求
    setTimeout(() => {
      wx.hideLoading();
      wx.showModal({
        title: 'VIP 身份解锁成功！',
        content: '尊贵的 Glow 会员，已为您开启免广告智能通道 👑',
        showCancel: false,
        confirmColor: '#9AADA2',
        success: (res) => {
          this.triggerAnalysis();
        }
      });
    }, 1000);
  },

  /**
   * 调用云函数生成 AI 趋势周报
   */
  async triggerAnalysis() {
    wx.showLoading({ title: 'AI 闺蜜分析数据中...' });

    const entitlement = localData.getEntitlementState();
    const reportLimit = entitlementRules.getReportArchiveLimit(entitlement);
    const diaries = localData.getSkinDiaries();
    const cabinet = localData.getCabinetProducts();
    const result = await cloudEnhancements.callFunctionSafe('skinDiaryAnalysis', { diaries, cabinet });

    const report = result.ok
      ? result.data
      : reportFallback.buildWeeklyReportFallback(diaries.slice(0, 7), cabinet);
    const reportTime = new Date().toLocaleString();

    localData.saveAiReport({
      type: 'weekly',
      data: report,
      source: result.ok ? 'cloud' : 'local_fallback',
      created_at: new Date().toISOString()
    }, reportLimit);

    this.setData({
      isReportUnlocked: true,
      weeklyReport: report,
      reportTime
    });

    wx.hideLoading();
    wx.showToast({ title: result.ok ? '周度报告已生成！' : '已生成本地分析', icon: 'success' });
  },

  onUnload() {
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
  }
});
