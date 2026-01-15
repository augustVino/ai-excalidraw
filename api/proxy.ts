import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * 设置 CORS 头部
 * 根据 Vercel 官方文档，需要在所有响应中设置完整的 CORS 头部
 */
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * 处理 OPTIONS 预检请求
 * 浏览器在跨域请求前会发送 OPTIONS 请求进行预检
 */
function handleOptionsRequest(res: VercelResponse) {
  setCorsHeaders(res);
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest(res);
  }

  const { apiUrl, path, method = req.method || 'GET' } = req.query;

  if (!apiUrl || !path) {
    setCorsHeaders(res);
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const targetUrl = `${apiUrl}${path}`;

    // 构建请求头，只传递必要的头部
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // 传递 Authorization 头部（如果存在）
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // 构建请求选项
    const options: RequestInit = {
      method: method as string,
      headers
    };

    // 处理请求体（POST、PUT 等）
    if (method !== 'GET' && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    // 发起请求
    const response = await fetch(targetUrl, options);

    // 设置 CORS 头部
    setCorsHeaders(res);

    // 检查响应类型
    const contentType = response.headers.get('content-type') || '';
    const isStreaming =
      contentType.includes('text/event-stream') ||
      contentType.includes('stream') ||
      response.headers.get('transfer-encoding') === 'chunked';

    // 如果是流式响应（SSE 或流式 JSON）
    if (isStreaming && response.body) {
      // 设置流式响应头部
      res.setHeader('Content-Type', contentType || 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

      // 设置响应状态码
      res.status(response.status);

      // 创建流式传输
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        // 流式读取并转发
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // 使用 res.write 进行流式传输
          // 注意：Vercel Serverless Functions 支持流式响应
          res.write(chunk);
        }
        return res.end();
      } catch (streamError) {
        console.error('Stream error:', streamError);
        // 如果流式传输失败，尝试返回错误
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Stream transmission failed' });
        }
        return res.end();
      }
    }

    // 普通 JSON 响应
    try {
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // 如果 JSON 解析失败，尝试返回文本
      const text = await response.text();
      res.setHeader('Content-Type', 'text/plain');
      return res.status(response.status).send(text);
    }
  } catch (error) {
    setCorsHeaders(res);
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
