// 企业微信网页授权回调（OAuth2）
// 流程：H5 内部通道在未识别身份时，前端跳转至企微授权页；
//       企微带着 code 重定向回本函数（redirect_uri 需配置为 https://jubao.sanchushan.com/api/wecom/oauth，
//       且该域名已在企微「网页授权及JS-SDK → 可信域名」中登记并通过 WW_verify 校验）；
//       本函数用 code 换取员工 userid（及姓名），写入 cookie 后跳回举报页，实现免口令自动识别。
// 任一步失败时不再静默跳回，而是返回诊断页，便于定位（环境变量缺失 / Secret 不对 / code 无效等）。
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const corpid = env.QY_CORPID;
  const secret = env.QY_CORPSECRET;
  const steps = [];

  if (!corpid || !secret) {
    const miss = [];
    if (!corpid) miss.push('QY_CORPID');
    if (!secret) miss.push('QY_CORPSECRET');
    return diag(steps, '缺少环境变量：' + miss.join('、') + '。请到 EdgeOne 项目设置 → 环境变量 添加，并重新部署。');
  }
  steps.push(['环境变量', 'QY_CORPID / QY_CORPSECRET 均已配置']);

  if (!code) {
    return diag(steps, '回调未收到 code（企微授权未完成）。常见原因：① 应用「可信域名」未填或未通过 WW_verify 校验；② 可信域名与 redirect_uri 域名不一致；③ 该应用不是发起授权的应用。');
  }
  steps.push(['收到 code', code.slice(0, 6) + '***']);

  let token = '';
  try {
    const tkRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${secret}`);
    const tk = await tkRes.json();
    steps.push(['gettoken', JSON.stringify({ errcode: tk.errcode || 0, errmsg: tk.errmsg || 'ok' })]);
    if (!tk.access_token) {
      return diag(steps, 'gettoken 失败：请确认 QY_CORPSECRET 是「发起网页授权的那个自建应用」的 Secret（不是通讯录同步 Secret，也不是别的应用的）。');
    }
    token = tk.access_token;
  } catch (e) {
    return diag(steps, 'gettoken 网络异常：' + e.message);
  }

  let info = {};
  try {
    const infoRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${token}&code=${code}`);
    info = await infoRes.json();
    steps.push(['getuserinfo', JSON.stringify({ errcode: info.errcode || 0, errmsg: info.errmsg || 'ok', userid: info.userid || '' })]);
  } catch (e) {
    return diag(steps, 'getuserinfo 网络异常：' + e.message);
  }

  const userid = info.userid || info.openid || '';
  if (!userid) {
    return diag(steps, '用 code 换身份失败。常见原因：① Secret 与发起授权的应用不是同一个（errcode 40029/41001）；② code 已被使用或已过期（刷新重试即可）；③ 该员工不在应用「可见范围」内。');
  }

  let name = '';
  if (info.userid) {
    try {
      const uRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${token}&userid=${encodeURIComponent(userid)}`);
      const u = await uRes.json();
      name = u.name || '';
      if (!name) steps.push(['user/get', JSON.stringify({ errcode: u.errcode, errmsg: u.errmsg }) + '（可选：未开通「通讯录读取」权限，仅影响显示姓名，不影响识别）']);
    } catch (e) {}
  }

  const h = new Headers();
  h.set('Location', '/index.html');
  h.append('Set-Cookie', `qy_userid=${encodeURIComponent(userid)}; Path=/; Max-Age=7200; SameSite=Lax`);
  h.append('Set-Cookie', `qy_name=${encodeURIComponent(name)}; Path=/; Max-Age=7200; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

function diag(steps, message) {
  const rows = steps.map(([k, v]) => `<tr><th>${esc(k)}</th><td><code>${esc(v)}</code></td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>企微授权诊断</title>
<style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#eef2e9;margin:0;padding:24px;color:#333}
.box{max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 6px 20px rgba(0,0,0,.08)}
h2{margin:0 0 6px;color:#b4443c;font-size:20px}p{line-height:1.8;font-size:14px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
th,td{border:1px solid #e3e8dc;padding:8px;text-align:left;word-break:break-all}th{background:#f4f7f0;width:110px}
code{color:#b4443c}a{color:#4a7a2b}</style></head><body><div class="box">
<h2>企微授权未完成</h2><p>${esc(message)}</p>${rows ? `<table>${rows}</table>` : ''}
<p style="margin-top:16px;color:#888">请截图本页发给我，我来定位修复。</p></div></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
