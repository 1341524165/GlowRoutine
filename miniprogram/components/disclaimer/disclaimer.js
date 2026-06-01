Component({
  properties: {},
  data: { visible: false },
  attached() {
    const agreed = wx.getStorageSync('has_agreed_disclaimer');
    if (!agreed) {
      this.setData({ visible: true });
    }
  },
  methods: {
    onAgree() {
      wx.setStorageSync('has_agreed_disclaimer', true);
      this.setData({ visible: false });
      this.triggerEvent('agreed');
    }
  }
});
