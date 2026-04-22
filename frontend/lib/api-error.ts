/**
 * Normaliza errores de API Nest (message / array de validación).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function parseApiErrorResponse(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const msg = extractMessage(body, res.statusText);
  return new ApiError(msg, res.status, body);
}

function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback || 'Request failed';
  }
  const o = body as Record<string, unknown>;
  if (typeof o.message === 'string') {
    return o.message;
  }
  if (Array.isArray(o.message)) {
    return o.message.map(String).join('; ');
  }
  if (Array.isArray(o.errors)) {
    return o.errors.map(String).join('; ');
  }
  return fallback || 'Request failed';
}
