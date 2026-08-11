import { describe, expect, it } from 'vitest';
import { normalizeEngineException } from '../lib/engineErrors';

describe('normalizeEngineException', () => {
  it('preserves the nested native cause returned by Expo', () => {
    expect(normalizeEngineException({
      code: 'ERR_FUNCTION_CALL',
      message: 'Call rejected',
      cause: { code: 'SERVICE_BIND_FAILED', message: 'Worker unavailable' },
    })).toEqual({
      errorCode: 'SERVICE_BIND_FAILED',
      message: 'Worker unavailable',
      stage: 'native-bridge',
      retryable: true,
    });
  });

  it('returns a stable fallback for non-error values', () => {
    expect(normalizeEngineException(null).errorCode).toBe('NATIVE_BRIDGE_REJECTED');
  });
});
