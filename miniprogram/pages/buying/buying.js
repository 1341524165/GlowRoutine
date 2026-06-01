Page({
  data: {
    inputMode: 'manual', // manual: 手动输入, smart: 智能识别/粘贴
    productName: '',
    pastedText: '',
    uploadedImage: '',
    isLoading: false,
    analysisResult: null
  },



  // 切换录入模式
  switchInputMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      inputMode: mode,
      analysisResult: null // 切换模式时清空上一次结果
    });
  },

  // 输入框绑定
  onInputName(e) {
    this.setData({ productName: e.detail.value });
  },

  onInputText(e) {
    this.setData({ pastedText: e.detail.value });
  },

  // 选择上传图片
  uploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({
          uploadedImage: res.tempFiles[0].tempFilePath
        });
        wx.showToast({
          title: '种草图上传成功',
          icon: 'success'
        });
      }
    });
  },

  // 移除已上传图片
  removeImage() {
    this.setData({
      uploadedImage: ''
    });
  },

  // 开始冷静避坑分析
  startAnalysis() {
    let targetName = this.data.productName.trim();

    if (this.data.inputMode === 'manual') {
      if (!targetName) {
        wx.showToast({ title: '请输入化妆品名称', icon: 'none' });
        return;
      }
    } else {
      // 智能识别模式：要求上传图片或粘贴文本
      if (!this.data.uploadedImage && !this.data.pastedText.trim()) {
        wx.showToast({ title: '请上传图片或粘贴种草文案', icon: 'none' });
        return;
      }

      // 如果有粘贴文本，自动尝试从中截取商品名
      if (this.data.pastedText.trim()) {
        const text = this.data.pastedText.trim();
        // 简单截取前12个字符作为临时商品名，或者匹配书名号/引号
        const nameMatch = text.match(/[《“]([^》”]+)[》”]/);
        targetName = nameMatch ? nameMatch[1] : text.substring(0, 15) + '...';
      } else {
        // 仅有图片，模拟OCR分析出来的化妆品名
        targetName = '小红书热门爆款精华/眼霜';
      }
    }

    // 开启莫兰迪高亮加载动效
    this.setData({
      isLoading: true,
      analysisResult: null
    });

    // 触发避坑分析云函数（云端自动并行聚合最新肤质与已有护肤品柜）
    wx.cloud.callFunction({
      name: 'buyingConsultation',
      data: {
        productName: targetName
      }
    }).then(res => {
      this.setData({ isLoading: false });
      if (res.result && res.result.success) {
        this.setData({
          analysisResult: res.result.data,
          // 确保把提取出来的商品名字更新，以便海报渲染
          productName: targetName
        });
        wx.showToast({
          title: '分析已完成',
          icon: 'success'
        });
      } else {
        wx.showToast({ title: '避坑分析出错，请重试', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '连接云端超时，请稍后重试', icon: 'none' });
    });
  },

  // 利用小程序原生 Canvas 2D 绘制并保存 9:16 黄金比例海报
  generateSharePoster() {
    if (!this.data.analysisResult) {
      wx.showToast({ title: '暂无分析结果', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '海报生成中...' });

    const query = wx.createSelectorQuery();
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          wx.hideLoading();
          wx.showToast({ title: '初始化画布失败', icon: 'none' });
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 9:16 标准海报宽高定义 (360x640)
        const width = 360;
        const height = 640;
        
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // 1. 绘制背景渐变
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#F7F4EF'); // 温润米白
        gradient.addColorStop(1, '#EFECE7'); // 稍微深色莫兰迪
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 2. 绘制卡片边框装饰
        ctx.strokeStyle = 'rgba(198, 164, 154, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(12, 12, width - 24, height - 24);

        // 3. 绘制顶部品牌
        ctx.fillStyle = '#777777';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillText('今日护肤日历 | Glow Routine', 30, 42);

        // 4. 标题及盖章
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 22px -apple-system, sans-serif';
        ctx.fillText('避坑冷静证书', 30, 75);

        // 5. 绘制印章/冷静指数
        const score = this.data.analysisResult.suitability_score;
        const isPass = score >= 7;
        const mainColor = isPass ? '#9AADA2' : '#D98880'; // 鼠尾草绿 vs 淡珊瑚红
        
        ctx.save();
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // 绘制双重圆框印章
        ctx.arc(285, 62, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(285, 62, 25, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = mainColor;
        ctx.font = 'bold 16px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(score + '分', 285, 54);
        
        ctx.font = 'bold 8px -apple-system, sans-serif';
        ctx.fillText(isPass ? '理性拔草' : '强力建议冷静', 285, 72);
        ctx.restore();

        // 绘制分割双横线
        ctx.strokeStyle = 'rgba(198, 164, 154, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 92);
        ctx.lineTo(235, 92);
        ctx.stroke();

        // 6. 商品名字
        ctx.fillStyle = '#C6A49A';
        ctx.font = 'bold 13px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('评估单品：' + this.data.productName, 30, 114);

        // 7. 详细分析项绘制
        let currentY = 145;

        // 营销脱水 Check
        currentY = this.drawSection(ctx, '💡 营销脱水 Check', this.data.analysisResult.hype_check, 30, currentY, 300, '#C6A49A');
        
        // 猛药冲突排查
        currentY = this.drawSection(ctx, '⚠️ 猛药冲突排查', this.data.analysisResult.conflict_warnings, 30, currentY + 15, 300, '#D98880');
        
        // 重复囤货警告
        currentY = this.drawSection(ctx, '🎒 功能重复/囤货警告', this.data.analysisResult.cabinet_overlap, 30, currentY + 15, 300, '#9AADA2');

        // 8. 闺蜜毒舌判决卡片
        const verdictY = 460;
        ctx.fillStyle = 'rgba(232, 160, 138, 0.08)';
        this.drawRoundRect(ctx, 24, verdictY, width - 48, 85, 8);
        ctx.fill();

        ctx.strokeStyle = 'rgba(232, 160, 138, 0.2)';
        ctx.stroke();

        ctx.fillStyle = '#E8A08A';
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.fillText('🗣️ 闺蜜毒舌判决：', 38, verdictY + 25);

        ctx.fillStyle = '#E8A08A';
        ctx.font = 'italic bold 11px -apple-system, sans-serif';
        this.drawTextWithWrap(ctx, `“${this.data.analysisResult.verdict}”`, 38, verdictY + 45, 275, 17);

        // 9. 底部小程序宣传与虚拟二维码
        const bottomY = 575;
        // 绘制精致二维码外框
        ctx.strokeStyle = 'rgba(198, 164, 154, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(30, bottomY, 38, 38);
        
        // 绘制简易莫兰迪风拟真二维码
        ctx.fillStyle = '#C6A49A';
        ctx.fillRect(34, bottomY + 4, 10, 10);
        ctx.fillRect(54, bottomY + 4, 10, 10);
        ctx.fillRect(34, bottomY + 24, 10, 10);
        ctx.fillRect(48, bottomY + 16, 6, 6);
        ctx.fillRect(54, bottomY + 24, 10, 10);

        ctx.fillStyle = '#777777';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.fillText('长按扫码，开启你的 AI 护肤搭子', 80, bottomY + 16);
        
        ctx.fillStyle = '#999999';
        ctx.font = '8px -apple-system, sans-serif';
        ctx.fillText('分享至小红书，不做护肤冤大头 · Glow Routine', 80, bottomY + 30);

        // 10. 输出为临时文件并保存至相册
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (res) => {
              wx.hideLoading();
              this.saveToAlbum(res.tempFilePath);
            },
            fail: (err) => {
              console.error(err);
              wx.hideLoading();
              wx.showToast({ title: '图片导出失败', icon: 'none' });
            }
          });
        }, 300); // 留出渲染同步时间
      });
  },

  // 绘制单节分析内容 (标题+换行正文)
  drawSection(ctx, title, content, x, y, width, titleColor) {
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillText(title, x, y);
    
    ctx.fillStyle = '#555555';
    ctx.font = '10.5px -apple-system, sans-serif';
    const nextY = this.drawTextWithWrap(ctx, content, x, y + 18, width, 16);
    return nextY;
  },

  // 圆角矩形辅助绘制
  drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  },

  // 换行绘制文本
  drawTextWithWrap(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split('');
    let line = '';
    let currentY = y;
    
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n];
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY;
  },

  // 保存图片至相册及权限处理
  saveToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.showModal({
          title: '保存成功',
          content: '冷静拔草海报证书已存入系统相册，快去小红书吐槽或分享给集美们吧！✨',
          showCancel: false
        });
      },
      fail: (err) => {
        console.error(err);
        if (err.errMsg.indexOf('auth deny') > -1 || err.errMsg.indexOf('auth denied') > -1) {
          wx.showModal({
            title: '授权提示',
            content: '需要同意保存图片至相册权限才能将证书存盘哦',
            success: (tipRes) => {
              if (tipRes.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({ title: '保存至相册失败', icon: 'none' });
        }
      }
    });
  }
});
