// 内部举报平台（企业微信小程序）
// 企业微信小程序在启动时通过 wx.qy.login 获取临时登录 code，
// 提交举报时把 code 发给后端，由后端用企业凭据换取举报人企微 userid，实现“身份自动识别、免输口令”。
App({
  globalData: {
    qyCode: ''
  },
  onLaunch() {
    if (typeof wx.qy !== 'undefined') {
      try {
        wx.qy.login({
          success: (res) => {
            if (res && res.code) this.globalData.qyCode = res.code;
          },
          fail: () => {}
        });
      } catch (e) {}
    }
  }
});
