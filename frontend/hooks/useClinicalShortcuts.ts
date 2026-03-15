'use client';

import { useEffect, useCallback } from 'react';

interface UseClinicalShortcutsOptions {
  onAddDiagnosis?: () => void;
  onAddTreatment?: () => void;
  onGenerateNote?: () => void;
  enabled?: boolean;
}

/**
 * Shortcuts de teclado para la consulta:
 * Ctrl+D → add diagnosis
 * Ctrl+T → add treatment
 * Ctrl+N → generate clinical note
 */
export function useClinicalShortcuts({
  onAddDiagnosis,
  onAddTreatment,
  onGenerateNote,
  enabled = true,
}: UseClinicalShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !(e.ctrlKey || e.metaKey)) return;
      switch (e.key?.toLowerCase()) {
        case 'd':
          e.preventDefault();
          onAddDiagnosis?.();
          break;
        case 't':
          e.preventDefault();
          onAddTreatment?.();
          break;
        case 'n':
          e.preventDefault();
          onGenerateNote?.();
          break;
      }
    },
    [enabled, onAddDiagnosis, onAddTreatment, onGenerateNote]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
