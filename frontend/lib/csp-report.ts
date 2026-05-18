/**
 * Sanitiza reportes CSP del navegador (sin query strings ni fragmentos con tokens).
 */
export type CspReportBody = {
  'csp-report'?: {
    'document-uri'?: string;
    'referrer'?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'original-policy'?: string;
    disposition?: string;
    'blocked-uri'?: string;
    'line-number'?: number;
    'column-number'?: number;
    'source-file'?: string;
    'status-code'?: number;
    'script-sample'?: string;
  };
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function stripUrlSecrets(raw: string | undefined): string | undefined {
  if (!raw || raw === 'inline' || raw === 'eval' || raw === 'self') {
    return raw;
  }
  try {
    const u = new URL(raw, 'https://example.invalid');
    u.search = '';
    u.hash = '';
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.slice(0, 200).replace(EMAIL_RE, '[redacted]');
  }
}

export function sanitizeCspReportPayload(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as CspReportBody;
  const report = root['csp-report'];
  if (!report || typeof report !== 'object') return null;

  return {
    documentUri: stripUrlSecrets(report['document-uri']),
    violatedDirective: report['violated-directive']?.slice(0, 120),
    effectiveDirective: report['effective-directive']?.slice(0, 120),
    blockedUri: stripUrlSecrets(report['blocked-uri']),
    disposition: report.disposition,
    lineNumber: report['line-number'],
    columnNumber: report['column-number'],
    sourceFile: stripUrlSecrets(report['source-file']),
    statusCode: report['status-code'],
    scriptSample: report['script-sample']?.slice(0, 80),
  };
}
