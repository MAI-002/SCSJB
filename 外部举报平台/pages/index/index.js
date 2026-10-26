// 外部举报平台（普通微信小程序）
const REPORT_API = 'https://jubao.sanchushan.com/api/report';

// 外部举报类型（与网页版外部通道一致）
const EXTERNAL_TYPES = [
  { title: '员工私下用个人账号收款', desc: '', val: '员工私下用个人账号收款' },
  { title: '员工索要或收受利益输送', desc: '礼品、红包、回扣、好处费、宴请、借款等', val: '员工索要或收受礼品、红包、回扣、好处费、宴请、借款等利益输送' },
  { title: '员工泄露公司商业机密', desc: '', val: '员工泄露公司商业机密' },
  { title: '员工与供应商或合作方串通舞弊', desc: '', val: '员工与供应商或合作方串通舞弊' },
  { title: '贪污贿赂与职务侵占', desc: '', val: '贪污贿赂与职务侵占' },
  { title: '串通虚报结算、虚开发票、套取公司资金', desc: '', val: '串通虚报结算、虚开发票、套取公司资金' },
  { title: '其他舞弊行为', desc: '', val: '其他舞弊行为', other: true }
];

const REWARD_TEXT = '举报奖励税前标准\n1、奖励比例：按实际追回涉案金额的5%计发\n2、保底奖励：奖金不足500元，统一按500元发放\n3、最高封顶：单笔举报奖励上限10000元\n\n举报规则\n1、订单消费类举报，需在消费当日起30个自然日内提交，超期无效\n2、同一员工同一违规事项，已核实结案的，后续举报均为重复举报，不予奖励\n3、所有举报需经官方核查属实，方可核算发放奖励\n4、举报属实不代表必然发放奖励，存在违规套利情形可拒发奖金';

function fileToBase64(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (r) => resolve('data:image/jpeg;base64,' + r.data),
      fail: reject
    });
  });
}

Page({
  data: {
    reportMode: '实名举报',
    showContact: true,
    contact: '',
    accusedName: '',
    dept: '',
    typeText: '请点击选择举报类型',
    typeVal: '',
    otherType: '',
    showOtherInput: false,
    content: '',
    charNum: 0,
    images: [],
    showTypePop: false,
    selectedIndex: -1,
    typeList: EXTERNAL_TYPES,
    submitting: false,
    anonymousConfirmed: false,
    success: false,
    reportNo: '',
    rewardText: REWARD_TEXT
  },

  onModeChange(e) {
    const m = e.detail.value;
    if (m === '匿名举报' && !this.data.anonymousConfirmed) {
      wx.showModal({
        title: '重要提醒',
        content: '本通道支持匿名举报，无需填写个人信息，提交后我们无法与您联系，视为自动放弃举报奖励。如需核实线索、反馈结果、领取奖励，请自愿填写联系方式。',
        confirmText: '同意匿名',
        cancelText: '返回',
        success: (r) => {
          if (r.confirm) {
            this.setData({ reportMode: '匿名举报', showContact: false, anonymousConfirmed: true, contact: '' });
          } else {
            this.setData({ reportMode: '实名举报', showContact: true });
          }
        }
      });
      return;
    }
    this.setData({ reportMode: m, showContact: m === '实名举报' });
  },

  onContact(e) { this.setData({ contact: e.detail.value }); },
  onAccused(e) { this.setData({ accusedName: e.detail.value }); },
  onDept(e) { this.setData({ dept: e.detail.value }); },
  onOther(e) { this.setData({ otherType: e.detail.value }); },
  onContent(e) { this.setData({ content: e.detail.value, charNum: e.detail.value.length }); },

  openTypePop() { this.setData({ showTypePop: true }); },
  closeTypePop() { this.setData({ showTypePop: false }); },
  noop() {},
  onTypeTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ selectedIndex: idx });
  },
  confirmTypePop() {
    const idx = this.data.selectedIndex;
    if (idx < 0) { wx.showToast({ title: '请选择举报类型', icon: 'none' }); return; }
    const item = this.data.typeList[idx];
    this.setData({
      showTypePop: false,
      typeText: item.title,
      typeVal: item.val,
      showOtherInput: !!item.other,
      otherType: ''
    });
  },

  chooseImage() {
    const remain = 5 - this.data.images.length;
    if (remain <= 0) { wx.showToast({ title: '最多5张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: this.data.images.concat(paths) });
      }
    });
  },
  previewImg(e) {
    const idx = Number(e.currentTarget.dataset.index);
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images });
  },
  delImg(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(idx, 1);
    this.setData({ images });
  },

  async onSubmit() {
    if (this.data.reportMode === '匿名举报' && !this.data.anonymousConfirmed) {
      wx.showToast({ title: '请先确认匿名举报提醒', icon: 'none' });
      return;
    }
    if (!this.data.dept.trim()) { wx.showToast({ title: '请填写门店/部门', icon: 'none' }); return; }
    if (!this.data.typeVal) { wx.showToast({ title: '请选择举报类型', icon: 'none' }); return; }
    if (this.data.showOtherInput && !this.data.otherType.trim()) {
      wx.showToast({ title: '请填写具体的舞弊行为（必填）', icon: 'none' }); return;
    }
    if (!this.data.content.trim()) { wx.showToast({ title: '请填写举报事由', icon: 'none' }); return; }
    if (this.data.reportMode === '实名举报' && !this.data.contact.trim()) {
      wx.showToast({ title: '实名举报必须填写联系方式', icon: 'none' }); return;
    }

    const reportNo = 'JB' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });

    try {
      const attachments = [];
      for (const p of this.data.images) {
        attachments.push({ filename: 'image.jpg', content_type: 'image/jpeg', data: await fileToBase64(p) });
      }
      const fields = {
        '举报编号': reportNo,
        '举报通道': '外部人员',
        '举报方式': this.data.reportMode,
        '联系方式': this.data.contact.trim() || '无（匿名）',
        '门店/部门': this.data.dept.trim(),
        '举报类别': this.data.showOtherInput ? (this.data.typeVal + '：' + this.data.otherType.trim()) : this.data.typeVal,
        '举报事由': this.data.content.trim()
      };
      if (this.data.accusedName.trim()) fields['被举报员工名字'] = this.data.accusedName.trim();

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: REPORT_API,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ fields, attachments }),
          success: (r) => {
            if (r.statusCode === 200 && r.data && r.data.success) resolve(r.data);
            else reject(new Error((r.data && r.data.message) || '提交失败'));
          },
          fail: () => reject(new Error('网络异常，请检查网络后重试'))
        });
      });

      wx.hideLoading();
      this.setData({ submitting: false, success: true, reportNo });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showModal({ title: '提交失败', content: err.message || '未知错误', showCancel: false });
    }
  }
});
