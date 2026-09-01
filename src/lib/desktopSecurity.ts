const SENSITIVE_QUERY_VALUE = /([?&#](?:access_token|refresh_token|token|code|authorization)=)[^&#\s]+/gi;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const MAGNET_VALUE = /magnet:\?[^\s"'<>]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g;

export function redactDesktopDiagnostic(value: unknown, maxLength = 240) {
  const text = value instanceof Error ? value.message : String(value || 'Unexpected desktop error.');
  return text
    .replace(SENSITIVE_QUERY_VALUE, '$1[redacted]')
    .replace(BEARER_VALUE, 'Bearer [redacted]')
    .replace(MAGNET_VALUE, 'magnet:[redacted]')
    .replace(JWT_VALUE, '[redacted-token]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(32, maxLength));
}

