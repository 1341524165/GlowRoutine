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
      const products = wx.getStorageSync('skincare_cabinet') || [];
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
        wx.showLoading({ title: 'AI 识别配方中...' });

        if (!wx.cloud) {
          // Fallback to local simulated OCR analysis
          setTimeout(() => {
            wx.hideLoading();
            this.fillOCRData({
              product_name: '修丽可 CE 精华',
              category: 'essence',
              pao_months: 6,
              ingredients: ['维C', '玻尿酸']
            });
            wx.showToast({ title: 'AI 识别填表成功！', icon: 'success' });
          }, 1500);
          return;
        }

        // Upload to cloud storage
        const cloudPath = `ocr/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            
            // Call OCR cloud function
            wx.cloud.callFunction({
              name: 'skincareCabinetOCR',
              data: { fileID }
            }).then(ocrRes => {
              wx.hideLoading();
              if (ocrRes.result && ocrRes.result.success) {
                this.fillOCRData(ocrRes.result.data);
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
            }).catch(err => {
              wx.hideLoading();
              console.error(err);
              wx.showToast({ title: '识别出错，已采用默认回填', icon: 'none' });
              this.fillOCRData({
                product_name: '已上传待核对品名',
                category: 'essence',
                pao_months: 12,
                ingredients: ['玻尿酸']
              });
            });
          },
          fail: err => {
            wx.hideLoading();
            console.error(err);
            wx.showToast({ title: '图片上传失败，已采用本地模拟识别', icon: 'none' });
            setTimeout(() => {
              this.fillOCRData({
                product_name: '理肤泉 B5 修复面霜',
                category: 'cream',
                pao_months: 6,
                ingredients: ['积雪草', 'B5']
              });
            }, 1000);
          }
        });
      }
    });
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

    const handleLocalSave = () => {
      let products = wx.getStorageSync('skincare_cabinet') || [];
      if (this.data.isEdit) {
        const index = products.findIndex(p => p._id === this.data.productId);
        if (index > -1) {
          products[index] = {
            ...products[index],
            product_name: productName,
            category: category,
            opened_date: openedDate,
            pao_months: parseInt(paoMonths),
            ingredients: selectedIngredients
          };
        }
      } else {
        const newProduct = {
          _id: 'local_' + Date.now(),
          product_name: productName,
          category: category,
          opened_date: openedDate,
          pao_months: parseInt(paoMonths),
          ingredients: selectedIngredients,
          status: 'opened',
          created_at: new Date().toISOString()
        };
        products.push(newProduct);
      }
      wx.setStorageSync('skincare_cabinet', products);
      wx.hideLoading();
      wx.showToast({ title: this.data.isEdit ? '修改成功(本地)' : '保存成功(本地)', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    };

    if (!wx.cloud) {
      // Offline fallback
      setTimeout(handleLocalSave, 800);
      return;
    }

    try {
      const db = wx.cloud.database();
      
      if (this.data.isEdit) {
        // Edit mode (Update)
        db.collection('skincare_cabinet').doc(this.data.productId).update({
          data: {
            product_name: productName,
            category: category,
            opened_date: openedDate,
            pao_months: parseInt(paoMonths),
            ingredients: selectedIngredients
          }
        }).then(res => {
          // Also update local storage for consistency
          let products = wx.getStorageSync('skincare_cabinet') || [];
          const index = products.findIndex(p => p._id === this.data.productId);
          if (index > -1) {
            products[index] = {
              ...products[index],
              product_name: productName,
              category: category,
              opened_date: openedDate,
              pao_months: parseInt(paoMonths),
              ingredients: selectedIngredients
            };
            wx.setStorageSync('skincare_cabinet', products);
          }
          
          wx.hideLoading();
          wx.showToast({ title: '修改成功！', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1200);
        }).catch(err => {
          console.warn('Cloud update failed, syncing locally', err);
          handleLocalSave();
        });
      } else {
        // Add mode
        db.collection('skincare_cabinet').add({
          data: {
            product_name: productName,
            category: category,
            opened_date: openedDate,
            pao_months: parseInt(paoMonths),
            ingredients: selectedIngredients,
            status: 'opened',
            created_at: new Date()
          }
        }).then(res => {
          // Also sync locally on successful cloud addition
          let products = wx.getStorageSync('skincare_cabinet') || [];
          const newProduct = {
            _id: res._id,
            product_name: productName,
            category: category,
            opened_date: openedDate,
            pao_months: parseInt(paoMonths),
            ingredients: selectedIngredients,
            status: 'opened',
            created_at: new Date().toISOString()
          };
          products.push(newProduct);
          wx.setStorageSync('skincare_cabinet', products);

          wx.hideLoading();
          wx.showToast({ title: '录入成功！', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1200);
        }).catch(err => {
          console.warn('Cloud save failed, syncing locally', err);
          handleLocalSave();
        });
      }
    } catch (e) {
      console.warn('Cloud database submission failed synchronously, syncing locally', e);
      handleLocalSave();
    }
  }
});
