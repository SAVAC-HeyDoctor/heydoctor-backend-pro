#!/usr/bin/env node

const baseUrl = (
  process.env.SMOKE_BASE_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  'http://127.0.0.1:3000'
).replace(/\/$/, '');

const checks = [
  { name: 'liveness', path: '/livez', requireReady: false },
  { name: 'readiness', path: '/readyz', requireReady: true },
  { name: 'version', path: '/api/health/version', requireReady: false },
];

async function checkEndpoint(check) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: 'GET',
    headers: { Accept: 'application/json,text/plain' },
  });
  const text = await response.text();
  const durationMs = Date.now() - started;

  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `${check.name} failed with HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  if (
    check.requireReady &&
    body &&
    typeof body === 'object' &&
    body.ok === false
  ) {
    throw new Error(`${check.name} reported not ready`);
  }

  console.log(
    JSON.stringify({
      event: 'deployment_smoke_check',
      check: check.name,
      statusCode: response.status,
      durationMs,
    }),
  );
}

async function main() {
  console.log(
    JSON.stringify({
      event: 'deployment_smoke_start',
      baseUrl,
    }),
  );
  for (const check of checks) {
    await checkEndpoint(check);
  }
  console.log(JSON.stringify({ event: 'deployment_smoke_passed' }));
}

main().catch((err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(
    JSON.stringify({
      event: 'deployment_smoke_failed',
      error: error.message,
    }),
  );
  process.exit(1);
});
