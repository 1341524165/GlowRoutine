# Skincare Cabinet Edit & Default Clean Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove default mock skincare items and enable double-click editing for skincare cabinet products with robust local storage synchronization.

**Architecture:** Enable the existing `add` page to double as an edit page by accepting a product ID parameter. Detect double tap in `cabinet.js` via successive touch timestamp differences (<350ms) and use synchronous `wx.getStorageSync` and `wx.setStorageSync` as an offline storage buffer.

**Tech Stack:** WeChat Mini Program JavaScript (ES6), WXML, WXSS, Storage API, WeChat Cloud Database.

---

### Task 1: Clean Up Default Mock Data and Sync Cabinet Local Storage

**Files:**
- Modify: `miniprogram/pages/cabinet/cabinet.js`

- [ ] **Step 1: Replace mock product references in initialization and process methods**
  Modify `miniprogram/pages/cabinet/cabinet.js` to completely remove mock items and replace them with local storage synchronization.

  Change code:
  ```javascript
  // Target: Lines 10-32 (loadCabinetProducts) and loadMockData removal
  // Replace the loadCabinetProducts and remove loadMockData methods
  loadCabinetProducts() {
    if (!wx.cloud) {
      const localProducts = wx.getStorageSync('skincare_cabinet') || [];
      this.processProducts(localProducts);
      return;
    }
    wx.showLoading({ title: '加载中...' });
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
  },

  processProducts(products) {
    // Sync to local storage for offline use
    wx.setStorageSync('skincare_cabinet', products);

    const processed = products.map(prod => {
      const openedDateStr = prod.opened_date;
      const opened = new Date(openedDateStr);
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
  ```

- [ ] **Step 2: Clean up onDeleteProduct to support offline/local storage deleting**
  Modify `cabinet.js` to delete from local cache when offline or fallback.

  Change code:
  ```javascript
  onDeleteProduct(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除确认',
      content: `确定要将 "${name}" 从护肤品柜中移除吗？`,
      success: (res) => {
        if (res.confirm) {
          if (!wx.cloud) {
            let products = wx.getStorageSync('skincare_cabinet') || [];
            products = products.filter(p => p._id !== id);
            wx.setStorageSync('skincare_cabinet', products);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadCabinetProducts();
            return;
          }

          wx.showLoading({ title: '删除中...' });
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
            wx.showToast({ title: '删除失败', icon: 'none' });
            console.error(err);
          });
        }
      }
    });
  }
  ```

- [ ] **Step 3: Remove the unused loadMockData method**
  Delete the block `loadMockData() { ... }` (lines 101 to 150 in the original file).

---

### Task 2: Implement Double-Tap Detection on Cabinet Cards

**Files:**
- Modify: `miniprogram/pages/cabinet/cabinet.wxml`
- Modify: `miniprogram/pages/cabinet/cabinet.js`

- [ ] **Step 1: Bind click event in cabinet.wxml**
  Change the product card wrapper in `miniprogram/pages/cabinet/cabinet.wxml` to include `bindtap="onProductTap"`.

  Code modification:
  ```xml
  <!-- Target line 31 in original cabinet.wxml -->
  <view class="product-card glass-card" wx:for="{{shelf.products}}" wx:key="_id" bindtap="onProductTap" bindlongpress="onDeleteProduct" data-id="{{item._id}}" data-name="{{item.product_name}}">
  ```

- [ ] **Step 2: Add double-tap detection handler in cabinet.js**
  Define `onProductTap` inside `cabinet.js` that checks for timestamps < 350ms to navigate to edit.

  Add code:
  ```javascript
  // Add as a new method under onAddProduct in cabinet.js
  onProductTap(e) {
    const id = e.currentTarget.dataset.id;
    const now = Date.now();
    const lastTap = this.lastTapTime || 0;
    this.lastTapTime = now;
    
    const lastTapId = this.lastTapId || '';
    this.lastTapId = id;

    if (now - lastTap < 350 && lastTapId === id) {
      wx.navigateTo({
        url: `/pages/cabinet/add?id=${id}`
      });
    }
  }
  ```

---

### Task 3: Support Product Loading and Prefilling on Add/Edit Page

**Files:**
- Modify: `miniprogram/pages/cabinet/add.js`
- Modify: `miniprogram/pages/cabinet/add.wxml`

- [ ] **Step 1: Check options.id in onLoad and load details**
  Modify `onLoad(options)` in `miniprogram/pages/cabinet/add.js` to detect editing mode and fetch product details.

  Change code:
  ```javascript
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
  ```

- [ ] **Step 2: Implement loadProductDetails and fillProductData methods**
  Add `loadProductDetails` and `fillProductData` methods to query and repopulate page data in `miniprogram/pages/cabinet/add.js`.

  Add code:
  ```javascript
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
  ```

- [ ] **Step 3: Modify add.wxml to reflect edit mode headers and submit button label**
  Modify headers and submit button text dynamically in `miniprogram/pages/cabinet/add.wxml`.

  Change code in `add.wxml` at lines 2-5:
  ```xml
    <view class="header">
      <text class="title">{{isEdit ? '修改护肤单品' : '录入护肤单品'}}</text>
      <text class="subtitle">{{isEdit ? '修改当前单品的属性和状态' : '手动填写或使用 AI 拍照自动录入'}}</text>
    </view>
  ```

  Change code in `add.wxml` at line 73:
  ```xml
        <button form-type="submit" class="submit-btn">{{isEdit ? '保存修改' : '保存至护肤柜'}}</button>
  ```

---

### Task 4: Implement Attribute Saving and Offline/Cloud Synchronization for Edits

**Files:**
- Modify: `miniprogram/pages/cabinet/add.js`

- [ ] **Step 1: Update onSubmit to support saving modifications**
  Modify `onSubmit(e)` in `miniprogram/pages/cabinet/add.js` to process update transactions when `isEdit` is true.

  Change code in `onSubmit(e)`:
  ```javascript
  onSubmit(e) {
    const productName = e.detail.value.productName || this.data.productName;
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

    // Handle Edit saving logic
    if (this.data.isEdit && this.data.productId) {
      const updatedProduct = {
        product_name: productName,
        category: category,
        opened_date: openedDate,
        pao_months: parseInt(paoMonths),
        ingredients: selectedIngredients,
      };

      if (!wx.cloud) {
        setTimeout(() => {
          const products = wx.getStorageSync('skincare_cabinet') || [];
          const idx = products.findIndex(p => p._id === this.data.productId);
          if (idx > -1) {
            products[idx] = {
              ...products[idx],
              ...updatedProduct
            };
            wx.setStorageSync('skincare_cabinet', products);
          }
          wx.hideLoading();
          wx.showToast({ title: '修改成功！', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1200);
        }, 800);
        return;
      }

      const db = wx.cloud.database();
      db.collection('skincare_cabinet').doc(this.data.productId).update({
        data: updatedProduct
      }).then(() => {
        const products = wx.getStorageSync('skincare_cabinet') || [];
        const idx = products.findIndex(p => p._id === this.data.productId);
        if (idx > -1) {
          products[idx] = {
            ...products[idx],
            ...updatedProduct
          };
          wx.setStorageSync('skincare_cabinet', products);
        }
        wx.hideLoading();
        wx.showToast({ title: '修改成功！', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败', icon: 'none' });
        console.error(err);
      });
      return;
    }

    // Original adding logic continues here
    const newProduct = {
      product_name: productName,
      category: category,
      opened_date: openedDate,
      pao_months: parseInt(paoMonths),
      ingredients: selectedIngredients,
      status: 'opened',
      created_at: new Date().toISOString()
    };

    if (!wx.cloud) {
      setTimeout(() => {
        const products = wx.getStorageSync('skincare_cabinet') || [];
        newProduct._id = 'local_' + Date.now();
        products.push(newProduct);
        wx.setStorageSync('skincare_cabinet', products);
        wx.hideLoading();
        wx.showToast({ title: '保存成功(本地)', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      }, 800);
      return;
    }

    const db = wx.cloud.database();
    db.collection('skincare_cabinet').add({
      data: newProduct
    }).then(res => {
      // Sync back locally
      newProduct._id = res._id;
      const products = wx.getStorageSync('skincare_cabinet') || [];
      products.push(newProduct);
      wx.setStorageSync('skincare_cabinet', products);

      wx.hideLoading();
      wx.showToast({ title: '录入成功！', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1200);
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，已写入本地模拟数据', icon: 'none' });
      console.error(err);
      
      const products = wx.getStorageSync('skincare_cabinet') || [];
      newProduct._id = 'local_' + Date.now();
      products.push(newProduct);
      wx.setStorageSync('skincare_cabinet', products);
      setTimeout(() => {
        wx.navigateBack();
      }, 1200);
    });
  }
  ```

---
