declare module '@vercel/blob' {
  export function put(pathname: string, body: string | Blob | ArrayBuffer | ReadableStream, options: Record<string, unknown>): Promise<{ url: string; pathname: string; etag?: string }>;
  export function list(options?: Record<string, unknown>): Promise<{ blobs: Array<{ url: string; pathname: string; uploadedAt?: string; size?: number }> }>;
}
