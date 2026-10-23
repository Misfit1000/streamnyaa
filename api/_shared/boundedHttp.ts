/** Bound data while reading it, including chunked responses with no Content-Length. */
export class HttpInputError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function readBoundedResponse(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new HttpInputError('Upstream response is too large.', 502);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpInputError('Upstream response is too large.', 502); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function boundedJson(response: Response, limit = 4 * 1024 * 1024): Promise<any> {
  const bytes = await readBoundedResponse(response, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpInputError('Upstream returned invalid JSON.', 502); }
}

export async function readJsonBody(req: any, limit = 32 * 1024): Promise<any> {
  if (Number(req.headers?.['content-length']) > limit) throw new HttpInputError('Request body is too large.', 413);
  let body = req.body;
  if (body === undefined) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > limit) throw new HttpInputError('Request body is too large.', 413);
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > limit) throw new HttpInputError('Request body is too large.', 413);
    try { body = JSON.parse(body || '{}'); } catch { throw new HttpInputError('Invalid JSON request.', 400); }
  } else if (Buffer.byteLength(JSON.stringify(body ?? {})) > limit) throw new HttpInputError('Request body is too large.', 413);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpInputError('A JSON object is required.', 400);
  return body;
}
