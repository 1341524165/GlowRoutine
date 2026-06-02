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
    sliderX: 150,
    isDashboardExpanded: false,
    activeChartTab: 'oil'
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

    if (this.data.isDashboardExpanded) {
      setTimeout(() => this.drawTrendChart(), 100);
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
      const singlePhoto = photoRecords[0].local_photo_path || photoRecords[0].photo_path || photoRecords[0].cloud_file_id;
      beforeUrl = singlePhoto;
      afterUrl = singlePhoto;
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
      localData.updateSkinDiaryId(localDiary._id, result.data._id, {
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

        // 初始化图片：如果 onShow 先触发且计算出了真实图片 URL，则使用它们；否则使用默认图
        const beforeUrl = this.pendingBeforeUrl || 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600';
        const afterUrl = this.pendingAfterUrl || 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600';
        
        this.pendingBeforeUrl = null;
        this.pendingAfterUrl = null;

        this.updateCompareImages(beforeUrl, afterUrl);
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
    if (!this.canvas) {
      this.pendingBeforeUrl = beforeUrl;
      this.pendingAfterUrl = afterUrl;
      return;
    }

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
  },

  toggleDashboard() {
    const nextState = !this.data.isDashboardExpanded;
    this.setData({ isDashboardExpanded: nextState }, () => {
      if (nextState) {
        setTimeout(() => {
          this.drawTrendChart();
        }, 150);
      }
    });
  },

  switchChartTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeChartTab) return;
    this.setData({ activeChartTab: tab }, () => {
      this.drawTrendChart();
    });
  },

  drawTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.warn('Trend Canvas node not ready yet');
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        const width = res[0].width;
        const height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        const stats = localData.getWeeklyTrendStats();
        
        ctx.clearRect(0, 0, width, height);
        
        if (this.data.activeChartTab === 'oil') {
          // 1. 油脂趋势 (oil)
          const data = stats.oilinessList;
          const dates = stats.datesList;
          if (data.length === 0) {
            ctx.fillStyle = '#777777';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('打卡数据不足，先去记本日记吧', width / 2, height / 2);
            return;
          }
          
          const paddingLeft = 40;
          const paddingRight = 20;
          const paddingTop = 30;
          const paddingBottom = 30;
          const chartWidth = width - paddingLeft - paddingRight;
          const chartHeight = height - paddingTop - paddingBottom;
          
          // Map points
          const points = [];
          for (let i = 0; i < data.length; i++) {
            const val = data[i];
            const x = data.length > 1 ? paddingLeft + (i / (data.length - 1)) * chartWidth : paddingLeft + chartWidth / 2;
            const y = paddingTop + chartHeight - ((val - 1) / 4) * chartHeight;
            points.push({ x, y });
          }
          
          // Draw grid and Y axis labels
          ctx.fillStyle = '#999999';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          const yTicks = [
            { val: 1, label: '干爽' },
            { val: 3, label: '中性' },
            { val: 5, label: '油腻' }
          ];
          yTicks.forEach(tick => {
            const y = paddingTop + chartHeight - ((tick.val - 1) / 4) * chartHeight;
            ctx.fillText(tick.label, paddingLeft - 8, y);
            
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(paddingLeft + chartWidth, y);
            ctx.strokeStyle = '#EFECE7';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
          });
          
          if (points.length > 1) {
            // Draw gradient fill
            const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
            grad.addColorStop(0, 'rgba(232, 160, 138, 0.35)');
            grad.addColorStop(1, 'rgba(232, 160, 138, 0.0)');
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[i];
              const p1 = points[i + 1];
              ctx.bezierCurveTo(
                p0.x + (p1.x - p0.x) / 3, p0.y,
                p1.x - (p1.x - p0.x) / 3, p1.y,
                p1.x, p1.y
              );
            }
            ctx.lineTo(points[points.length - 1].x, paddingTop + chartHeight);
            ctx.lineTo(points[0].x, paddingTop + chartHeight);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            
            // Draw curve stroke
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[i];
              const p1 = points[i + 1];
              ctx.bezierCurveTo(
                p0.x + (p1.x - p0.x) / 3, p0.y,
                p1.x - (p1.x - p0.x) / 3, p1.y,
                p1.x, p1.y
              );
            }
            ctx.strokeStyle = '#E8A08A';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          } else {
            // If only 1 data point, draw flat line
            ctx.beginPath();
            ctx.moveTo(paddingLeft, points[0].y);
            ctx.lineTo(paddingLeft + chartWidth, points[0].y);
            ctx.strokeStyle = '#E8A08A';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          
          // Draw points
          points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#E8A08A';
            ctx.lineWidth = 2.5;
            ctx.stroke();
          });
          
          // Draw X labels
          ctx.fillStyle = '#777777';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          points.forEach((p, i) => {
            ctx.fillText(dates[i], p.x, paddingTop + chartHeight + 6);
          });
          
        } else if (this.data.activeChartTab === 'alert') {
          // 2. 警报频次 (alert)
          const barData = [
            { name: '红血丝', count: stats.alertCounts.redness, color: '#D98880' },
            { name: '爆痘', count: stats.alertCounts.acne, color: '#E9BC84' },
            { name: '脱皮', count: stats.alertCounts.peeling, color: '#88A9C3' }
          ];
          
          const paddingLeft = 45;
          const paddingRight = 25;
          const paddingTop = 30;
          const paddingBottom = 30;
          const chartWidth = width - paddingLeft - paddingRight;
          const chartHeight = height - paddingTop - paddingBottom;
          
          const maxVal = Math.max(3, ...barData.map(b => b.count));
          
          // Draw grid and Y axis
          ctx.fillStyle = '#999999';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          
          const ticks = [0, Math.round(maxVal / 2), maxVal];
          const uniqueTicks = [...new Set(ticks)];
          uniqueTicks.forEach(tick => {
            const y = paddingTop + chartHeight - (tick / maxVal) * chartHeight;
            ctx.fillText(tick + '次', paddingLeft - 8, y);
            
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(paddingLeft + chartWidth, y);
            ctx.strokeStyle = '#EFECE7';
            ctx.stroke();
            ctx.setLineDash([]);
          });
          
          // Draw Bars
          const colWidth = chartWidth / 3;
          const barWidth = Math.min(32, colWidth * 0.5);
          
          barData.forEach((item, i) => {
            const x = paddingLeft + i * colWidth + (colWidth - barWidth) / 2;
            const barH = (item.count / maxVal) * chartHeight;
            const y = paddingTop + chartHeight - barH;
            
            if (barH > 0) {
              const r = Math.min(6, barWidth / 2, barH);
              
              // Vertical gradient
              const grad = ctx.createLinearGradient(x, y, x, y + barH);
              grad.addColorStop(0, item.color);
              grad.addColorStop(1, item.color + '88');
              
              ctx.beginPath();
              ctx.moveTo(x, y + barH);
              ctx.lineTo(x, y + r);
              ctx.arcTo(x, y, x + r, y, r);
              ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
              ctx.lineTo(x + barWidth, y + barH);
              ctx.closePath();
              
              ctx.fillStyle = grad;
              ctx.fill();
            }
            
            // Count text above bar
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(item.count + '次', x + barWidth / 2, y - 4);
            
            // Label text below bar
            ctx.fillStyle = '#777777';
            ctx.font = '10px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText(item.name, x + barWidth / 2, paddingTop + chartHeight + 6);
          });
          
        } else {
          // 3. 诱因占比 (trigger)
          const allTriggers = [
            { key: 'stay_up', name: '熬夜', count: stats.triggerCounts.stay_up, color: '#E8A08A' },
            { key: 'spicy', name: '辣食/火锅', count: stats.triggerCounts.spicy, color: '#D98880' },
            { key: 'sugar', name: '甜食/奶茶', count: stats.triggerCounts.sugar, color: '#E9BC84' }
          ];
          
          const centerX = width * 0.32;
          const centerY = height * 0.38;
          const outerR = 42;
          const innerR = 26;
          
          // Bottom Quote box setup
          const boxX = 15;
          const boxY = height - 52;
          const boxW = width - 30;
          const boxH = 40;
          
          let tipText = '';
          if (stats.totalTriggers === 0) {
            // Draw placeholder donut in soft grey
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
            ctx.arc(centerX, centerY, innerR, Math.PI * 2, 0, true);
            ctx.closePath();
            ctx.fillStyle = '#EFECE7';
            ctx.fill();
            
            ctx.fillStyle = '#777777';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂无', centerX, centerY - 6);
            ctx.fillStyle = '#999999';
            ctx.font = '9px sans-serif';
            ctx.fillText('诱因', centerX, centerY + 8);
            
            tipText = '宝子本周记录超级养生！零熬夜零甜辣，皮肤屏障在默默给你点赞，继续保持哦！✨';
          } else {
            const activeTriggers = allTriggers.filter(t => t.count > 0);
            let startAngle = -Math.PI / 2;
            
            activeTriggers.forEach(item => {
              const sliceAngle = (item.count / stats.totalTriggers) * Math.PI * 2;
              const endAngle = startAngle + sliceAngle;
              
              ctx.beginPath();
              ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
              ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true);
              ctx.closePath();
              ctx.fillStyle = item.color;
              ctx.fill();
              
              startAngle = endAngle;
            });
            
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('诱因', centerX, centerY - 6);
            ctx.fillStyle = '#777777';
            ctx.font = '9px sans-serif';
            ctx.fillText('占比', centerX, centerY + 8);
            
            // Find highest count trigger
            let maxTrigger = allTriggers[0];
            allTriggers.forEach(item => {
              if (item.count > maxTrigger.count) {
                maxTrigger = item;
              }
            });
            
            const pct = Math.round((maxTrigger.count / stats.totalTriggers) * 100);
            if (maxTrigger.key === 'stay_up') {
              tipText = `宝子最近的皮肤警报有${pct}%都和熬夜修仙有关，今晚得乖乖早睡，拒绝熊猫眼噢！✨`;
            } else if (maxTrigger.key === 'spicy') {
              tipText = `小辣妹注意啦！本周${pct}%的皮肤警报来自火辣美食，火锅虽爽，可别让脸蛋红通通抗议呀！🌶️`;
            } else {
              tipText = `糖分超标警告！最近${pct}%的肤态波动和奶茶甜食有关，AI闺蜜劝你少喝半糖，多喝温水哦！🍼`;
            }
          }
          
          // Draw Legend on the right side
          const legendX = width * 0.58;
          const legendYStart = centerY - 20;
          
          allTriggers.forEach((item, idx) => {
            const y = legendYStart + idx * 20;
            
            // color circle
            ctx.beginPath();
            ctx.arc(legendX, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
            
            // label name
            ctx.fillStyle = '#555555';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.name, legendX + 10, y);
            
            // percentage
            const pct = stats.totalTriggers > 0 ? Math.round((item.count / stats.totalTriggers) * 100) : 0;
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(pct + '%', legendX + 80, y);
          });
          
          // Draw Quote Box at the bottom
          ctx.beginPath();
          ctx.moveTo(boxX + 8, boxY);
          ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, 8);
          ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, 8);
          ctx.arcTo(boxX, boxY + boxH, boxX, boxY, 8);
          ctx.arcTo(boxX, boxY, boxX + boxW, boxY, 8);
          ctx.closePath();
          ctx.fillStyle = '#FAF6F0';
          ctx.fill();
          
          // Write Quote Text
          ctx.fillStyle = '#8A6E64';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          // Simple wrapper or draw text inside quote box
          const words = tipText.split('');
          let line = '';
          let currentY = boxY + 14;
          const lineH = 14;
          const maxTextW = boxW - 20;
          
          for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n];
            let metrics = ctx.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > maxTextW && n > 0) {
              ctx.fillText(line, boxX + 10, currentY);
              line = words[n];
              currentY += lineH;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, boxX + 10, currentY);
        }
      });
  }
});
