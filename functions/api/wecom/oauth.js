// 企业微信网页授权回调（OAuth2）
// 流程：H5 内部通道在未识别身份时，前端跳转至企微授权页；
//       企微带着 code 重定向回本函数（redirect_uri 需配置为 https://jubao.sanchushan.com/api/wecom/oauth，
//       且该域名已在企微「网页授权及JS-SDK → 可信域名」中登记并通过 WW_verify 校验）；
//       本函数用 code 换取员工 userid（及姓名），写入 cookie 后跳回举报页，实现免口令自动识别。
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const corpid = env.QY_CORPID;
  const secret = env.QY_CORPSECRET;

  let userid = '';
  let name = '';

  if (code && corpid && secret) {
    try {
      const tkRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${secret}`);
      const tk = await tkRes.json();
      if (tk.access_token) {
        const infoRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${tk.access_token}&code=${code}`);
        const info = await infoRes.json();
        userid = info.userid || info.openid || '';
        if (info.userid) {
          const uRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${tk.access_token}&userid=${encodeURIComponent(userid)}`);
          const u = await uRes.json();
          name = u.name || '';
        }
      }
    } catch (e) {}
  }

  const h = new Headers();
  h.set('Location', '/index.html');
  if (userid) {
    h.append('Set-Cookie', `qy_userid=${encodeURIComponent(userid)}; Path=/; Max-Age=7200; SameSite=Lax`);
    h.append('Set-Cookie', `qy_name=${encodeURIComponent(name)}; Path=/; Max-Age=7200; SameSite=Lax`);
  }
  return new Response(null, { status: 302, headers: h });
}
