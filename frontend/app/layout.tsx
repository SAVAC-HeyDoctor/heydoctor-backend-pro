import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClientRoot } from './client-root';
import './globals.css';

export const metadata: Metadata = {
  title: 'HeyDoctor',
  description: 'Panel clínico HeyDoctor',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
