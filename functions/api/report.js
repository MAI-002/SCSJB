// EdgeOne Pages 边缘函数：接收举报表单（文本 + 附件），转发到企业微信群机器人
// 路由：/api/report  （与 index.html 同域，避免跨域问题）
// 环境变量 WECHAT_ROBOT_KEY：企业微信群机器人 webhook 地址中 key= 后面的那段

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
  const key = env.WECHAT_ROBOT_KEY;
  if (!key) {
    return json({ success: false, message: '服务器未配置企业微信机器人 key（WECHAT_ROBOT_KEY）' }, 500);
  }
  const sendUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + key;
  const uploadBase = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=' + key + '&type=';

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json({ success: false, message: '表单解析失败：' + e.message }, 400);
  }

  const fields = {};
  const files = [];
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
        const ct = f.type || (isImage ? 'image/jpeg' : 'application/octet-stream');
        let fname = f.name || (isImage ? 'image.jpg' : 'file.bin');
        if (/[^\x00-\x7F]/.test(fname)) fname = isImage ? 'image.jpg' : 'file.bin'; // 文件名非 ASCII 时强制 ASCII，避免破坏 multipart
        const boundary = '----EdgeOneBoundary' + Math.random().toString(16).slice(2);
        const head = '--' + boundary + '\r\n'
          + 'Content-Disposition: form-data; name="media"; filename="' + fname + '"\r\n'
          + 'Content-Type: ' + ct + '\r\n\r\n';
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
