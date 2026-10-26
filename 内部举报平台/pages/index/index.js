const app = getApp();
// 后端地址（与网页版共用同一个 EdgeOne 函数）。需在企微小程序后台把该域名加入“request 合法域名”
const REPORT_API = 'https://jubao.sanchushan.com/api/report';

// 内部举报类型（与网页版内部通道一致）
const INNER_TYPES = [
  { title: '贪污贿赂与职务侵占', desc: '贪污腐败、索贿、挪用公款；私收现金或营业款、侵占公司财物及资产等行为', val: '贪污贿赂与职务侵占（贪污腐败、索贿、挪用公款；私收现金或营业款、侵占公司财物及资产等行为）' },
  { title: '外部主体利益输送', desc: '与供应商、合作方、顾客发生私人金钱往来，收受礼金、礼品、接受宴请；在采购、工程、开发环节串通围标、虚假比价、进行利益输送、变相接受任何形式的回扣等行为', val: '外部主体利益输送（与供应商、合作方、顾客发生私人金钱往来，收受礼金、礼品、接受宴请；在采购、工程、开发环节串通围标、虚假比价、进行利益输送、变相接受任何形式的回扣等行为）' },
  { title: '违规私人资金往来', desc: '收受下级人员超过200元的礼金、礼物、招待等（红白喜事往来限额500元以内）；同事之间借款', val: '违规私人资金往来（收受下级人员超过200元的礼金、礼物、招待等（红白喜事往来限额500元以内）；同事之间借款）' },
  { title: '数据造假与虚假操作', desc: '弄虚作假、虚增计件；虚假退单、违规免单；虚假验收、虚报损耗；财务造假、伪造凭证、违规付款、虚开发票、虚假报销等行为', val: '数据造假与虚假操作（弄虚作假、虚增计件；虚假退单、违规免单；虚假验收、虚报损耗；财务造假、伪造凭证、违规付款、虚开发票、虚假报销等行为）' },
  { title: '泄露公司机密与出卖利益', desc: '泄露、倒卖公司机密，利用涉密信息谋取私利；出卖公司利益；损害、诋毁公司声誉等行为', val: '泄露公司机密与出卖利益（泄露、倒卖公司机密，利用涉密信息谋取私利；出卖公司利益；损害、诋毁公司声誉等行为）' },
  { title: '管理徇私舞弊', desc: '在人事招聘、薪酬核定、岗位晋升中徇私舞弊、优亲厚友；不公平对待下属，滥用职权、以权谋私等行为', val: '管理徇私舞弊（在人事招聘、薪酬核定、岗位晋升中徇私舞弊、优亲厚友；不公平对待下属，滥用职权、以权谋私等行为）' },
  { title: '违法行为', desc: '参与赌博、涉毒、涉黄等各类违法活动', val: '违法行为（参与赌博、涉毒、涉黄等各类违法活动）' },
  { title: '违规副业经营', desc: '工作时间从事兼职、外部经营活动；利用公司资源、个人职务身份、公司客户资源开展兼职、投资、自营经营等相关活动', val: '违规副业经营（工作时间从事兼职、外部经营活动；利用公司资源、个人职务身份、公司客户资源开展兼职、投资、自营经营等相关活动）' },
  { title: '不当侵害行为', desc: '对公司员工、合作方员工、顾客实施职场暴力、霸凌、骚扰、歧视、打击报复等侵害人身及合法权益的行为', val: '不当侵害行为（对公司员工、合作方员工、顾客实施职场暴力、霸凌、骚扰、歧视、打击报复等侵害人身及合法权益的行为）' },
  { title: '其他违反廉洁红线行为', desc: '', val: '其他违反廉洁红线行为', other: true }
];

const REWARD_TEXT = '举报奖励税前标准（下列岗位是指被举报人的岗位级别）：\n1、普通员工级（含领班级）100-1000元；\n2、主管级别500-2000元；\n3、经理级别1000-4000元；\n4、经理级别以上2000-8000元；\n5、追回涉案金额按回款5%计发，该类奖金上限10000元；\n6、举报经查证属实但无明确责任人，酌情给予物质或精神奖励；\n7、岗位档位奖金、追回比例奖金择高发放，不得重复领取。\n注：奖金随月度薪资一同发放。';

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
    typeList: INNER_TYPES,
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
      wx.showToast({ title: '请填写具体的违反廉洁红线行为（必填）', icon: 'none' }); return;
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
        '举报通道': '内部员工',
        '举报方式': this.data.reportMode,
        '联系方式': this.data.contact.trim() || '无（匿名）',
        '门店/部门': this.data.dept.trim(),
        '举报类别': this.data.showOtherInput ? (this.data.typeVal + '：' + this.data.otherType.trim()) : this.data.typeVal,
        '举报事由': this.data.content.trim(),
        '被举报员工名字': this.data.accusedName.trim()
      };
      // 企微身份自动识别：把启动时的登录 code 交给后端换取 userid，无需口令
      fields['__code'] = app.globalData.qyCode || '';

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
