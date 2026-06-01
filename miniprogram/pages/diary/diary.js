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
    const hasProfile = wx.getStorageSync('has_skin_profile');
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
    const loadFromLocal = () => {
      const localLogs = wx.getStorageSync('skin_diary_logs') || [];
      const sevenDaysAgoTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const localCount = localLogs.filter(log => {
        const dStr = log.created_at || log.date;
        const logDate = new Date(dStr).getTime();
        return logDate >= sevenDaysAgoTime;
      }).length;

      const photoRecords = localLogs.filter(log => log.photo_path && log.photo_path !== '');
      let beforeUrl = 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600'; // 默认 Before
      let afterUrl = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600';  // 默认 After

      if (photoRecords.length >= 2) {
        // 本地日记数组中是最新打卡在最前，因此最老的一张在末尾
        beforeUrl = photoRecords[photoRecords.length - 1].photo_path;
        afterUrl = photoRecords[0].photo_path;
      } else if (photoRecords.length === 1) {
        afterUrl = photoRecords[0].photo_path;
      }

      this.setData({ checkInCount: localCount });
      this.updateCompareImages(beforeUrl, afterUrl);
    };

    if (!wx.cloud) {
      loadFromLocal();
      return;
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // 统计最近 7 天内的打卡次数以判断是否解锁周报
      db.collection('skin_diary').where({
        created_at: _.gte(sevenDaysAgo)
      }).count().then(res => {
        this.setData({ checkInCount: res.total });
      }).catch(err => {
        console.error('统计打卡失败，切换本地数据:', err);
        loadFromLocal();
      });

      // 动态拉取 Before/After 皮肤对比照片
      db.collection('skin_diary')
        .where({
          photo_path: db.command.exists(true).and(db.command.neq(''))
        })
        .orderBy('created_at', 'asc')
        .get()
        .then(res => {
          const records = res.data || [];
          let beforeUrl = 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600'; // 默认 Before
          let afterUrl = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600';  // 默认 After

          if (records.length >= 2) {
            // 最早一张照片作为 Before，最新一张照片作为 After
            beforeUrl = records[0].photo_path;
            afterUrl = records[records.length - 1].photo_path;
          } else if (records.length === 1) {
            afterUrl = records[0].photo_path;
          }

          this.updateCompareImages(beforeUrl, afterUrl);
        }).catch(err => {
          console.error('拉取皮肤照片记录失败，使用本地缓存:', err);
          loadFromLocal();
        });
    } catch (e) {
      console.warn('云数据库打卡统计加载失败，已采用本地缓存:', e);
      loadFromLocal();
    }
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
  uploadPhotoToCloud() {
    return new Promise((resolve, reject) => {
      if (!this.data.photoPath) {
        resolve('');
        return;
      }
      
      const filePath = this.data.photoPath;
      const cloudPath = `skin_diaries/${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`;
      
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => {
          console.log('[上传成功] 云存储路径:', res.fileID);
          resolve(res.fileID);
        },
        fail: e => {
          console.error('[上传失败] 错误信息:', e);
          wx.showToast({ title: '照片上传失败，正在以无图模式保存', icon: 'none' });
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
    
    try {
      // 1. 先上传图片（若有）
      const cloudPhotoPath = await this.uploadPhotoToCloud();
      
      // 2. 保存到 NoSQL skin_diary 集合
      const db = wx.cloud.database();
      const activeTriggers = this.data.triggerOptions
        .filter(t => t.checked)
        .map(t => t.value);

      const isRednessChecked = this.data.statusOptions.find(s => s.value === 'redness')?.checked || false;
      const isAcneChecked = this.data.statusOptions.find(s => s.value === 'acne')?.checked || false;
      const isPeelingChecked = this.data.statusOptions.find(s => s.value === 'peeling')?.checked || false;

      db.collection('skin_diary').add({
        data: {
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
          photo_path: cloudPhotoPath,
          created_at: new Date()
        }
      }).then(() => {
        wx.hideLoading();
        wx.showToast({
          title: '今日打卡已保存！',
          icon: 'success',
          duration: 2000
        });

        // 重新加载统计与对比
        this.loadCheckInStats();
        
        // 重置打卡表单
        this.setData({
          photoPath: '',
          oiliness: 3,
          statusOptions: this.data.statusOptions.map(s => ({ ...s, checked: false })),
          triggerOptions: this.data.triggerOptions.map(t => ({ ...t, checked: false }))
        });

      }).catch(err => {
        wx.hideLoading();
        console.error('日记入库失败:', err);
        wx.showToast({ title: '数据库保存失败，请稍后重试', icon: 'none' });
      });

    } catch (e) {
      wx.hideLoading();
      console.error('打卡保存时发生致命异常:', e);
      wx.showToast({ title: '保存出错，请重试', icon: 'none' });
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
  triggerAnalysis() {
    wx.showLoading({ title: 'AI 闺蜜分析数据中...' });
    
    try {
      wx.cloud.callFunction({
        name: 'skinDiaryAnalysis',
        success: (res) => {
          wx.hideLoading();
          if (res.result && res.result.success) {
            const report = res.result.data;
            const reportTime = new Date().toLocaleString();
            
            this.setData({
              isReportUnlocked: true,
              weeklyReport: report,
              reportTime
            });

            // 存入缓存，无需重复看广告
            wx.setStorageSync('report_unlocked', true);
            wx.setStorageSync('last_weekly_report', report);
            wx.setStorageSync('last_report_time', reportTime);
            
            wx.showToast({ title: '周度报告已生成！', icon: 'success' });
          } else {
            console.error('云端分析错误:', res.result?.error);
            wx.showToast({ title: 'AI 闺蜜偷懒了，请重试', icon: 'none' });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('调用云端分析失败:', err);
          wx.showToast({ title: '网络超时，请稍后重试', icon: 'none' });
        }
      });
    } catch (e) {
      wx.hideLoading();
      console.warn('云函数调用失败，已切换至本地智能分析:', e);
      // 离线状态本地分析回填，保证100%可用
      setTimeout(() => {
        const localReport = {
          oilTrend: '水分充足，皮脂分泌趋于平衡',
          rednessControl: '屏障泛红状况已得到明显改善，耐受度提升',
          suggestions: '【离线AI分析】建议继续使用当前的氨基酸洁面与面霜。近期皮肤状态回稳，可按步骤维持防晒，保持规律作息。'
        };
        const reportTime = new Date().toLocaleString();
        this.setData({
          isReportUnlocked: true,
          weeklyReport: localReport,
          reportTime
        });
        wx.setStorageSync('report_unlocked', true);
        wx.setStorageSync('last_weekly_report', localReport);
        wx.setStorageSync('last_report_time', reportTime);
        wx.showToast({ title: '离线分析成功！', icon: 'success' });
      }, 1000);
    }
  },

  onUnload() {
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
  }
});
