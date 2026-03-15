'use client';

import React, { useState } from 'react';
import type { ClinicalNoteData } from './GenerateClinicalNoteButton';

interface ClinicalNoteEditorProps {
  note: ClinicalNoteData;
  onSave: (note: ClinicalNoteData) => void;
  onCancel: () => void;
}

/**
 * Editor de nota clínica - permite editar antes de guardar.
 */
export function ClinicalNoteEditor({ note, onSave, onCancel }: ClinicalNoteEditorProps) {
  const [chiefComplaint, setChiefComplaint] = useState(note.chief_complaint);
  const [hpi, setHpi] = useState(note.history_of_present_illness);
  const [assessment, setAssessment] = useState(note.assessment);
  const [plan, setPlan] = useState(note.plan);

  const handleSave = () => {
    onSave({
      chief_complaint: chiefComplaint,
      history_of_present_illness: hpi,
      assessment: assessment,
      plan: plan,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-800">Nota clínica (editar antes de guardar)</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chief Complaint</label>
            <textarea
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">History of Present Illness</label>
            <textarea
              value={hpi}
              onChange={(e) => setHpi(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assessment</label>
            <textarea
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
