/**
 * Rewrites opcionales: el navegador llama a /api/* en el mismo origen (Vercel)
 * y Next reenvía al backend sin inyectar Authorization (solo cookies si mismo dominio).
 *
 * Definir BACKEND_PROXY_TARGET=https://tu-backend.railway.app
 * y NEXT_PUBLIC_USE_API_PROXY=1 + getApiBase() vacío en api-client.
 */
const target = (process.env.BACKEND_PROXY_TARGET ?? '').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (!target) return [];
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
