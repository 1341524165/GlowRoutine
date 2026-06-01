Page({
  data: {
    shelves: []
  },

  onShow() {
    this.loadCabinetProducts();
  },

  loadCabinetProducts() {
    if (!wx.cloud) {
      const localProducts = wx.getStorageSync('skincare_cabinet') || [];
      this.processProducts(localProducts);
      return;
    }
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      db.collection('skincare_cabinet')
        .get()
        .then(res => {
          wx.hideLoading();
          if (res.data && res.data.length > 0) {
            this.processProducts(res.data);
          } else {
            this.processProducts([]);
          }
        })
        .catch(err => {
          wx.hideLoading();
          console.error('获取护肤柜失败，使用本地缓存:', err);
          const localProducts = wx.getStorageSync('skincare_cabinet') || [];
          this.processProducts(localProducts);
        });
    } catch (e) {
      wx.hideLoading();
      console.warn('云数据库获取失败，已切换至本地缓存:', e);
      const localProducts = wx.getStorageSync('skincare_cabinet') || [];
      this.processProducts(localProducts);
    }
  },

  processProducts(products) {
    // Sync to local storage for offline use
    wx.setStorageSync('skincare_cabinet', products);

    const processed = products.map(prod => {
      const openedDateStr = prod.opened_date || new Date().toISOString().split('T')[0];
      let opened = new Date(openedDateStr);
      if (isNaN(opened.getTime())) {
        opened = new Date();
      }
      const now = new Date();
      
      const timeDiff = now.getTime() - opened.getTime();
      const elapsedDays = Math.floor(timeDiff / (1000 * 3600 * 24));
      const totalPaoDays = (prod.pao_months || 12) * 30;
      const remainingDays = totalPaoDays - elapsedDays;
      
      let remainingText = '';
      let percent = 0;
      
      if (remainingDays > 0) {
        percent = Math.min(100, Math.max(0, (remainingDays / totalPaoDays) * 100));
        if (remainingDays >= 30) {
          const remMonths = Math.floor(remainingDays / 30);
          const remDays = Math.floor(remainingDays % 30);
          remainingText = `${remMonths}个月${remDays > 0 ? remDays + '天' : ''}`;
        } else {
          remainingText = `${remainingDays}天`;
        }
      } else {
        percent = 0;
        remainingText = '已过期';
      }
      
      let style = 'safe';
      if (percent <= 25) {
        style = 'danger';
      } else if (percent <= 50) {
        style = 'warning';
      }

      return {
        ...prod,
        remainingText,
        remainingPercent: percent,
        remainingStyle: style
      };
    });

    const categories = [
      { key: 'cleanser', title: '温和洁面', icon: '🧼' },
      { key: 'toner', title: '爽肤水', icon: '💧' },
      { key: 'essence', title: '精华液', icon: '🧪' },
      { key: 'cream', title: '面霜/乳液', icon: '🧴' },
      { key: 'sunscreen', title: '防晒霜', icon: '☀️' },
      { key: 'active', title: '活性/A醇/酸类', icon: '⚡' }
    ];

    const shelves = categories.map(cat => {
      return {
        key: cat.key,
        title: cat.title,
        icon: cat.icon,
        products: processed.filter(p => p.category === cat.key)
      };
    }).filter(shelf => shelf.products.length > 0);

    this.setData({ shelves });
  },

  onAddProduct() {
    wx.navigateTo({
      url: '/pages/cabinet/add'
    });
  },

  onEditProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/cabinet/add?id=${id}`
    });
  },

  onDeleteProduct(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除确认',
      content: `确定要将 "${name}" 从护肤品柜中移除吗？`,
      success: (res) => {
        if (res.confirm) {
          const deleteFromLocal = () => {
            let products = wx.getStorageSync('skincare_cabinet') || [];
            products = products.filter(p => p._id !== id);
            wx.setStorageSync('skincare_cabinet', products);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadCabinetProducts();
          };

          if (!wx.cloud) {
            deleteFromLocal();
            return;
          }

          wx.showLoading({ title: '删除中...' });
          try {
            const db = wx.cloud.database();
            db.collection('skincare_cabinet').doc(id).remove().then(() => {
              let products = wx.getStorageSync('skincare_cabinet') || [];
              products = products.filter(p => p._id !== id);
              wx.setStorageSync('skincare_cabinet', products);
              
              wx.hideLoading();
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadCabinetProducts();
            }).catch(err => {
              wx.hideLoading();
              console.warn('Cloud delete failed, falling back to local deletion:', err);
              deleteFromLocal();
            });
          } catch (e) {
            wx.hideLoading();
            console.warn('Cloud database delete failed synchronously, falling back to local deletion:', e);
            deleteFromLocal();
          }
        }
      }
    });
  }
});
