import type { EngineFailure } from '../types';

export function normalizeEngineException(error: unknown): EngineFailure {
  const candidate = error as { message?: unknown; code?: unknown; cause?: unknown } | null;
  const nested = candidate?.cause as { message?: unknown; code?: unknown } | null;
  return {
    errorCode: String(nested?.code || candidate?.code || 'NATIVE_BRIDGE_REJECTED'),
    message: String(nested?.message || candidate?.message || 'The Android streaming bridge did not respond.'),
    stage: 'native-bridge',
    retryable: true,
  };
}
