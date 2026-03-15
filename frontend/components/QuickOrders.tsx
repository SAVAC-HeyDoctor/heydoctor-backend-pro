'use client';

import React, { useState } from 'react';
import { SmartDiagnosisPicker } from './SmartDiagnosisPicker';
import { AutoTreatmentSuggestions } from './AutoTreatmentSuggestions';

type QuickOrderType = 'diagnostic' | 'treatment' | 'test' | 'prescription';

interface QuickOrdersProps {
  onAddDiagnostic?: (item: { code: string; description: string }) => void;
  onAddTreatment?: (name: string) => void;
  onOrderTest?: (name: string) => void;
  onCreatePrescription?: (items: string[]) => void;
  symptoms?: string[];
  clinicId?: number | null;
  className?: string;
}

/**
 * Panel QuickOrders - permite al médico rápidamente:
 * add diagnostic, add treatment, order test, create prescription.
 * 1-2 clicks para máxima velocidad.
 */
export function QuickOrders({
  onAddDiagnostic,
  onAddTreatment,
  onOrderTest,
  onCreatePrescription,
  symptoms = [],
  clinicId,
  className = '',
}: QuickOrdersProps) {
  const [activeTab, setActiveTab] = useState<QuickOrderType>('diagnostic');
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);
  const [treatmentInput, setTreatmentInput] = useState('');
  const [testInput, setTestInput] = useState('');
  const [prescriptionItems, setPrescriptionItems] = useState<string[]>([]);
  const [prescriptionInput, setPrescriptionInput] = useState('');

  const addDiagnostic = (item: { code: string; description: string }) => {
    onAddDiagnostic?.(item);
    setSelectedDiagnosis(`${item.code} - ${item.description}`);
  };

  const addTreatment = (name: string) => {
    onAddTreatment?.(name);
    setTreatmentInput('');
  };

  const addTest = () => {
    if (testInput.trim()) {
      onOrderTest?.(testInput.trim());
      setTestInput('');
    }
  };

  const addPrescriptionItem = () => {
    if (prescriptionInput.trim()) {
      setPrescriptionItems((p) => [...p, prescriptionInput.trim()]);
      setPrescriptionInput('');
    }
  };

  const createPrescription = () => {
    if (prescriptionItems.length > 0) {
      onCreatePrescription?.(prescriptionItems);
      setPrescriptionItems([]);
    }
  };

  const tabs: { id: QuickOrderType; label: string }[] = [
    { id: 'diagnostic', label: 'Diagnóstico' },
    { id: 'treatment', label: 'Tratamiento' },
    { id: 'test', label: 'Estudio' },
    { id: 'prescription', label: 'Receta' },
  ];

  return (
    <div className={`rounded-lg border border-gray-200 p-3 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Órdenes rápidas</h3>
      <div className="flex gap-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-2 py-1 text-xs rounded ${activeTab === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'diagnostic' && (
        <div className="space-y-2">
          <SmartDiagnosisPicker
            onChange={addDiagnostic}
            symptoms={symptoms}
            clinicId={clinicId}
            placeholder="Buscar CIE-10..."
          />
          <AutoTreatmentSuggestions
            diagnosis={selectedDiagnosis}
            clinicId={clinicId}
            onSelectTreatment={addTreatment}
          />
        </div>
      )}

      {activeTab === 'treatment' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={treatmentInput}
              onChange={(e) => setTreatmentInput(e.target.value)}
              placeholder="Tratamiento..."
              className="flex-1 px-2 py-1.5 border rounded text-sm"
            />
            <button
              type="button"
              onClick={() => addTreatment(treatmentInput)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm"
            >
              +
            </button>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTest()}
              placeholder="Ordenar estudio..."
              className="flex-1 px-2 py-1.5 border rounded text-sm"
            />
            <button
              type="button"
              onClick={addTest}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm"
            >
              Ordenar
            </button>
          </div>
        </div>
      )}

      {activeTab === 'prescription' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={prescriptionInput}
              onChange={(e) => setPrescriptionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPrescriptionItem()}
              placeholder="Medicamento..."
              className="flex-1 px-2 py-1.5 border rounded text-sm"
            />
            <button
              type="button"
              onClick={addPrescriptionItem}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm"
            >
              +
            </button>
          </div>
          {prescriptionItems.length > 0 && (
            <ul className="text-sm space-y-1">
              {prescriptionItems.map((item, i) => (
                <li key={i} className="flex justify-between">
                  {item}
                  <button
                    type="button"
                    onClick={() => setPrescriptionItems((p) => p.filter((_, j) => j !== i))}
                    className="text-red-500 text-xs"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={createPrescription}
            disabled={prescriptionItems.length === 0}
            className="w-full py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >
            Crear receta
          </button>
        </div>
      )}
    </div>
  );
}
