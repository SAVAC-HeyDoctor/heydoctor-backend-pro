'use client';

import React, { useState } from 'react';
import { generateClinicalNote } from '../lib/api-ai';
import { ClinicalNoteEditor } from './ClinicalNoteEditor';

interface GenerateClinicalNoteButtonProps {
  consultationId?: number | string;
  symptoms?: string[];
  clinicalNotes?: string;
  patientHistory?: Record<string, unknown>;
  onSave?: (note: ClinicalNoteData) => void;
  className?: string;
}

export interface ClinicalNoteData {
  chief_complaint: string;
  history_of_present_illness: string;
  assessment: string;
  plan: string;
}

/**
 * Botón "Generate Clinical Note" - genera nota clínica con AI Copilot + Clinical Intelligence.
 * El médico puede editar antes de guardar.
 */
export function GenerateClinicalNoteButton({
  consultationId,
  symptoms = [],
  clinicalNotes,
  patientHistory,
  onSave,
  className = '',
}: GenerateClinicalNoteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<ClinicalNoteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateClinicalNote({
        consultationId,
        symptoms,
        clinicalNotes,
        patientHistory,
      });
      const data = res?.data ?? res;
      if (data) {
        setNote({
          chief_complaint: data.chief_complaint ?? '',
          history_of_present_illness: data.history_of_present_illness ?? '',
          assessment: data.assessment ?? '',
          plan: data.plan ?? '',
        });
      } else {
        setError('No se pudo generar la nota');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className={`px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 ${className}`}
      >
        {loading ? 'Generando...' : 'Generate Clinical Note'}
      </button>
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
      {note && (
        <ClinicalNoteEditor
          note={note}
          onSave={(edited) => {
            onSave?.(edited);
            setNote(null);
          }}
          onCancel={() => setNote(null)}
        />
      )}
    </>
  );
}
