'use client';

import type { ReactNode } from 'react';
import { AppWithClinic } from '../AppWithClinic';
import { AppErrorBoundary } from '../components/AppErrorBoundary';

export function ClientRoot({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary>
      <AppWithClinic>{children}</AppWithClinic>
    </AppErrorBoundary>
  );
}
