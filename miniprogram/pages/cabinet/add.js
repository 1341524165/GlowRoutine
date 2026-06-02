const localData = require('../../utils/localData');
const entitlementRules = require('../../utils/entitlementRules');
const cloudEnhancements = require('../../utils/cloudEnhancements');

const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return [year, month, day].map(formatNumber).join('-')
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

Page({
  data: {
    isEdit: false,
    productId: '',
    today: '',
    openedDate: '',
    paoMonths: 12,
    productName: '',
    selectedCategory: '',
    categories: [
      { key: 'cleanser', name: '🧼 洁面' },
      { key: 'toner', name: '💧 爽肤水' },
      { key: 'essence', name: '🧪 精华液' },
      { key: 'cream', name: '🧴 面霜/乳液' },
      { key: 'sunscreen', name: '☀️ 防晒霜' },
      { key: 'active', name: '⚡ 活性/A醇/酸类' }
    ],
    ingredients: [
      { name: 'A醇', selected: false },
      { name: '酸类', selected: false },
      { name: '烟酰胺', selected: false },
      { name: '维C', selected: false },
      { name: 'B5', selected: false },
      { name: '积雪草', selected: false },
      { name: '玻尿酸', selected: false },
      { name: '神经酰胺', selected: false },
      { name: '酵母', selected: false }
    ]
  },

  onLoad(options) {
    const todayStr = formatTime(new Date());
    this.setData({
      today: todayStr,
      openedDate: todayStr
    });

    if (options && options.id) {
      this.setData({
        isEdit: true,
        productId: options.id
      });
      wx.setNavigationBarTitle({
        title: '修改单品属性'
      });
      this.loadProductDetails(options.id);
    }
  },

  loadProductDetails(id) {
    wx.showLoading({ title: '加载中...' });
    
    const loadFromLocal = () => {
      const products = localData.getCabinetProducts();
      const product = products.find(p => p._id === id);
      if (product) {
        this.fillProductData(product);
        wx.hideLoading();
      } else {
        wx.hideLoading();
        wx.showToast({ title: '未找到该单品', icon: 'none' });
      }
    };

    if (!wx.cloud) {
      loadFromLocal();
      return;
    }

    try {
      const db = wx.cloud.database();
      db.collection('skincare_cabinet').doc(id).get().then(res => {
        wx.hideLoading();
        if (res.data) {
          this.fillProductData(res.data);
        } else {
          loadFromLocal();
        }
      }).catch(err => {
        console.warn('Failed to load from cloud db, trying local storage', err);
        loadFromLocal();
      });
    } catch (e) {
      console.warn('Cloud database call failed synchronously, trying local storage', e);
      loadFromLocal();
    }
  },

  fillProductData(product) {
    if (!product) return;
    const updatedIngs = this.data.ingredients.map(item => {
      return {
        ...item,
        selected: (product.ingredients || []).includes(item.name)
      };
    });

    this.setData({
      productName: product.product_name || '',
      selectedCategory: product.category || '',
      openedDate: product.opened_date || this.data.today,
      paoMonths: product.pao_months || 12,
      ingredients: updatedIngs
    });
  },

  onSelectCategory(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({
      selectedCategory: key
    });
  },

  onToggleIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const key = `ingredients[${index}].selected`;
    this.setData({
      [key]: !this.data.ingredients[index].selected
    });
  },

  onDateChange(e) {
    this.setData({
      openedDate: e.detail.value
    });
  },

  onPaoChange(e) {
    this.setData({
      paoMonths: e.detail.value
    });
  },

  onOCRUpload() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        const entitlement = localData.getEntitlementState();
        const usage = localData.getUsageState();
        const quota = entitlementRules.canUseCloudFeature('ai_ocr', entitlement, usage, new Date());

        if (!quota.allowed) {
          wx.showModal({
            title: '额度已用完',
            content: '本月免费额度已用完。宝子，可以通过观看 15 秒短片瞬间解锁 1 次额外额度，或者订阅会员免广告畅用 👑',
            confirmText: '看广告解锁',
            cancelText: '取消',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.showAdAndUnlockOcr(tempFilePath);
              }
            }
          });
          return;
        }

        this.performOCRUploadAndProcess(tempFilePath);
      }
    });
  },

  performOCRUploadAndProcess(tempFilePath) {
    wx.showLoading({ title: 'AI 识别配方中...' });
    const cloudPath = `ocr/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
    cloudEnhancements.uploadFileSafe(cloudPath, tempFilePath).then(upload => {
      if (!upload.ok) {
        wx.hideLoading();
        wx.showToast({ title: '图片上传失败，已采用本地模拟识别', icon: 'none' });
        this.fillOCRData({
          product_name: '理肤泉 B5 修复面霜',
          category: 'cream',
          pao_months: 6,
          ingredients: ['积雪草', 'B5']
        });
        return;
      }
      return cloudEnhancements.callFunctionSafe('skincareCabinetOCR', { fileID: upload.data }).then(ocrRes => {
        wx.hideLoading();
        if (ocrRes.ok) {
          const usage = localData.getUsageState();
          localData.saveUsageState(entitlementRules.incrementUsage(usage, 'ai_ocr', new Date()));
          this.fillOCRData(ocrRes.data);
          wx.showToast({ title: 'AI 填表成功！', icon: 'success' });
        } else {
          wx.showToast({ title: '识别失败，已采用默认回填', icon: 'none' });
          this.fillOCRData({
            product_name: '已上传待核对品名',
            category: 'essence',
            pao_months: 12,
            ingredients: ['玻尿酸']
          });
        }
      });
    });
  },

  showAdAndUnlockOcr(tempFilePath) {
    if (this.videoAd) {
      this.videoAd.show().catch(err => {
        console.warn('Ad show failed, retrying load', err);
        this.videoAd.load().then(() => this.videoAd.show());
      });
      return;
    }

    if (wx.createRewardedVideoAd) {
      // 线上真机加载微信官方激励广告
      const ad = wx.createRewardedVideoAd({ adUnitId: 'adunit-mock-id' });
      ad.onLoad(() => console.log('RewardedVideoAd loaded'));
      ad.onError((err) => {
        console.warn('RewardedVideoAd load error, triggering simulated ad fallback', err);
        this.runSimulatedAd(tempFilePath);
      });
      ad.onClose((res) => {
        if (res && res.isEnded) {
          wx.showToast({ title: '广告完成，额度已解锁！', icon: 'success' });
          this.grantAdExemption(tempFilePath);
        } else {
          wx.showToast({ title: '中途关闭，未能解锁哦', icon: 'none' });
        }
      });
      this.videoAd = ad;
      ad.show().catch(err => {
        console.warn('Initial show failed, triggering simulated ad fallback', err);
        this.runSimulatedAd(tempFilePath);
      });
    } else {
      this.runSimulatedAd(tempFilePath);
    }
  },

  runSimulatedAd(tempFilePath) {
    wx.showLoading({ title: '赞助商视频播放中 (3s)...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '广告完成，额度已解锁！', icon: 'success' });
      this.grantAdExemption(tempFilePath);
    }, 3000);
  },

  grantAdExemption(tempFilePath) {
    // 豁免配额：将本地 monthlyCount 回退 1 次
    const usage = localData.getUsageState();
    const key = entitlementRules.monthKey(new Date());
    if (usage[key] && usage[key]['ai_ocr'] > 0) {
      usage[key]['ai_ocr']--;
      localData.saveUsageState(usage);
    }
    // 再次触发 OCR 图片上传及后台提取流程
    this.performOCRUploadAndProcess(tempFilePath);
  },

  fillOCRData(data) {
    if (!data) return;
    const updatedIngs = this.data.ingredients.map(item => {
      return {
        ...item,
        selected: (data.ingredients || []).includes(item.name)
      };
    });

    this.setData({
      productName: data.product_name || '',
      selectedCategory: data.category || '',
      paoMonths: data.pao_months || 12,
      ingredients: updatedIngs
    });
  },

  onSubmit(e) {
    const productName = e.detail.value.productName || '';
    const category = this.data.selectedCategory;
    const openedDate = this.data.openedDate;
    const paoMonths = this.data.paoMonths;

    if (!productName.trim()) {
      wx.showToast({ title: '请输入产品名称', icon: 'none' });
      return;
    }
    if (!category) {
      wx.showToast({ title: '请选择品类分类', icon: 'none' });
      return;
    }

    const selectedIngredients = this.data.ingredients
      .filter(item => item.selected)
      .map(item => item.name);

    wx.showLoading({ title: '保存中...' });

    const productPayload = {
      _id: this.data.isEdit ? this.data.productId : undefined,
      product_name: productName,
      category,
      opened_date: openedDate,
      pao_months: parseInt(paoMonths),
      ingredients: selectedIngredients,
      status: 'opened'
    };

    const saved = localData.upsertCabinetProduct(productPayload);

    wx.hideLoading();
    wx.showToast({ title: this.data.isEdit ? '修改成功' : '录入成功', icon: 'success' });

    const cloudPayload = {
      product_name: saved.product_name,
      category: saved.category,
      opened_date: saved.opened_date,
      pao_months: saved.pao_months,
      ingredients: saved.ingredients,
      status: saved.status,
      updated_at: new Date()
    };

    const syncPromise = this.data.isEdit && !saved._id.startsWith('local_')
      ? cloudEnhancements.updateDocumentSafe('skincare_cabinet', saved._id, cloudPayload)
      : cloudEnhancements.addDocumentSafe('skincare_cabinet', { ...cloudPayload, created_at: new Date() });

    syncPromise.then(result => {
      if (result.ok && result.data && result.data._id && saved._id.startsWith('local_')) {
        localData.deleteCabinetProduct(saved._id);
        localData.upsertCabinetProduct({
          ...saved,
          _id: result.data._id,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
      } else if (!result.ok) {
        console.warn('Cabinet cloud sync skipped:', result.error);
      }
    });

    setTimeout(() => wx.navigateBack(), 1000);
  }
});
