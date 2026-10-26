// EdgeOne Pages 边缘函数：接收举报表单（文本 + 附件），转发到企业微信群机器人
// 路由：/api/report  （与页面/小程序同域，避免跨域问题）
// 支持两种提交方式：
//   1) multipart/form-data（网页版原方式，含图片附件）
//   2) application/json（小程序方式，图片以 base64 放在 attachments 数组）
// 环境变量：
//   WECHAT_ROBOT_KEY：企业微信群机器人 webhook 地址中 key= 后面的那段
//   INNER_REPORT_PASSWORD：内部通道口令（网页版使用）
//   QY_CORPID / QY_CORPSECRET：企业微信 corpId 与通讯录 secret（企微小程序自动识别身份用）

// 内部通道口令验证总开关：false=禁用验证（任何人可直接进入内部通道并提交），true=启用口令校验
// 后期需要重新启用验证时，把这里改回 true 即可（前端对应开关：index.html 中的 INNER_AUTH_ENABLED）
const INNER_AUTH_ENABLED = true;

// 企微 access_token 简单缓存（按隔离环境存活，足够低频使用）
const QY_TOKEN_CACHE = { token: '', expire: 0 };

async function getQyToken(env) {
  const corpid = env.QY_CORPID, secret = env.QY_CORPSECRET;
  if (!corpid || !secret) return '';
  const now = Date.now();
  if (QY_TOKEN_CACHE.token && QY_TOKEN_CACHE.expire > now) return QY_TOKEN_CACHE.token;
  try {
    const r = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${secret}`);
    const j = await r.json().catch(() => ({}));
    if (j.access_token) {
      QY_TOKEN_CACHE.token = j.access_token;
      QY_TOKEN_CACHE.expire = now + (j.expires_in ? (j.expires_in - 300) * 1000 : 0);
      return j.access_token;
    }
  } catch (e) {}
  return '';
}

// 用企微小程序登录 code 换取举报人企微 userid（自动识别身份，免输口令）
async function exchangeQyCode(env, code) {
  if (!code) return '';
  const token = await getQyToken(env);
  if (!token) return '';
  try {
    const r = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${token}&code=${code}`);
    const j = await r.json().catch(() => ({}));
    if (j.userid) return j.userid;
    if (j.openid) return j.openid;
  } catch (e) {}
  return '';
}

function buildMarkdown(fields) {
  const lines = ['## 收到一条新举报'];
  for (const k of Object.keys(fields)) {
    if (k === 'subject') continue; // subject 仅作参考标题，正文用下面的明细字段
    const v = String(fields[k] || '').trim();
    if (v) lines.push('> **' + k + '**：' + v);
  }
  lines.push('> **提交时间**：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  return lines.join('\n');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost({ request, env }) {
  const ct = request.headers.get('content-type') || '';
  const fields = {};
  const files = [];

  if (ct.includes('application/json')) {
    // 小程序提交：fields 对象 + attachments 数组（base64 dataURL）
    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ success: false, message: 'JSON 解析失败：' + e.message }, 400);
    }
    const f = payload.fields || {};
    for (const k of Object.keys(f)) fields[k] = String(f[k] == null ? '' : f[k]);
    const atts = payload.attachments || [];
    for (const a of atts) {
      try {
        const dataUrl = a.data || '';
        const base64 = dataUrl.split(',')[1] || '';
        if (!base64) continue;
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const type = a.content_type || 'image/jpeg';
        files.push(new Blob([bytes], { type }));
      } catch (e) {}
    }
  } else {
    // 网页版提交：multipart/form-data
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return json({ success: false, message: '表单解析失败：' + e.message }, 400);
    }
    for (const pair of formData.entries()) {
      const k = pair[0];
      const v = pair[1];
      if (typeof v === 'string') {
        fields[k] = v;
      } else if (v && typeof v === 'object' && typeof v.arrayBuffer === 'function') {
        files.push(v); // File / Blob（图片附件）
      } else {
        fields[k] = String(v);
      }
    }
  }

  // 内部通道口令校验（独立分支，无需机器人 key）：
  // 前端输入口令后先调用本接口验证；提交举报时内部通道也必须带 __innerPwd，否则拒绝转发，防止绕过前端直接调用
  if (fields['__action'] === 'verify') {
    const ok = (fields['__pwd'] || '') === (env.INNER_REPORT_PASSWORD || 'JUBAO');
    return json({ success: ok, message: ok ? '' : '口令错误' });
  }

  const key = env.WECHAT_ROBOT_KEY;
  if (!key) {
    return json({ success: false, message: '服务器未配置企业微信机器人 key（WECHAT_ROBOT_KEY）' }, 500);
  }

  // 内部通道身份校验：企微自动识别（__code 换 userid）或 原口令（__innerPwd）
  if (fields['举报通道'] === '内部员工') {
    let userId = '';
    if (fields['__code']) userId = await exchangeQyCode(env, fields['__code']);
    if (userId) fields['举报人企微ID'] = userId;

    const pwdOk = (fields['__innerPwd'] || '') === (env.INNER_REPORT_PASSWORD || 'JUBAO');
    const codeOk = !!fields['__code'];
    if (INNER_AUTH_ENABLED && !pwdOk && !codeOk) {
      return json({ success: false, message: '内部通道校验失败，请重新进入通道' }, 403);
    }
  }
  // 内部标识字段仅用于鉴权，不进入群消息展示
  delete fields['__code'];
  delete fields['__innerPwd'];

  const sendUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + key;
  const uploadBase = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=' + key + '&type=';

  try {
    // 1) 先发文本（markdown）
    const markdown = buildMarkdown(fields);
    const textResp = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdown } })
    });
    const textJson = await textResp.json().catch(() => ({}));
    if (textJson.errcode !== 0) {
      return json({ success: false, message: '企业微信推送失败：' + (textJson.errmsg || 'unknown') }, 502);
    }

    // 2) 逐个上传附件：手动拼 multipart 请求体，直接把原始 File 字节写入，
    //    避免边缘函数 fetch+FormData 把 Blob/File 部件内容丢掉导致企业微信收到空文件（errcode 44001）
    const fileDetails = [];
    for (const f of files) {
      try {
        const isImage = (f.type || '').startsWith('image/');
        const ct2 = f.type || (isImage ? 'image/jpeg' : 'application/octet-stream');
        let fname = f.name || (isImage ? 'image.jpg' : 'file.bin');
        if (/[^\x00-\x7F]/.test(fname)) fname = isImage ? 'image.jpg' : 'file.bin'; // 文件名非 ASCII 时强制 ASCII，避免破坏 multipart
        const boundary = '----EdgeOneBoundary' + Math.random().toString(16).slice(2);
        const head = '--' + boundary + '\r\n'
          + 'Content-Disposition: form-data; name="media"; filename="' + fname + '"\r\n'
          + 'Content-Type: ' + ct2 + '\r\n\r\n';
        const tail = '\r\n--' + boundary + '--\r\n';
        const body = new Blob([head, f, tail]);
        if (body.size <= head.length + tail.length) {
          fileDetails.push('skip empty file(size=' + f.size + '): ' + fname);
          continue;
        }
        // 企业微信群机器人 webhook 的 upload_media 仅支持 type=file（image/voice/video 是普通 API 用的），故统一用 file 上传并以 msgtype:file 发送
        const up = await fetch(uploadBase + 'file', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
          body: body
        });
        const upJson = await up.json().catch(() => ({}));
        if (upJson.media_id) {
          const bodyMsg = { msgtype: 'file', file: { media_id: upJson.media_id } };
          const sendFile = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyMsg)
          });
          const sf = await sendFile.json().catch(() => ({}));
          fileDetails.push(sf.errcode === 0 ? 'ok' : (sf.errmsg || 'send fail'));
        } else {
          fileDetails.push('upload fail: ' + (upJson.errmsg || 'no media_id'));
        }
      } catch (fe) {
        fileDetails.push('error: ' + fe.message);
      }
    }

    return json({ success: true, files: files.length, fileDetails: fileDetails });
  } catch (e) {
    return json({ success: false, message: '转发异常：' + e.message }, 500);
  }
}

// 非 POST 请求兜底
export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return new Response('请使用 POST 提交举报', { status: 405 });
}
