# Doctor Workspace – Integración AI en el Frontend

Este documento describe las pantallas, componentes e integración de AI/CDSS/Predictive Medicine en el espacio de trabajo del médico dentro de HeyDoctor.

---

## 1. Resumen

El frontend **reutiliza y extiende** las páginas existentes (dashboard, consulta, perfil de paciente) añadiendo paneles laterales y componentes que consumen las APIs de AI del backend:

| API | Uso |
|-----|-----|
| `GET /api/copilot/suggestions?consultationId=X` | Sugerencias durante consulta activa |
| `POST /api/cdss/evaluate` | Alertas clínicas (CDSS) |
| `POST /api/predictive-medicine/risk` | Riesgos predictivos y acciones preventivas |
| `GET /api/clinical-intelligence/suggest?symptoms=...` | Sugerencias basadas en datos históricos |
| `GET /api/search?q=...&type=patient\|doctor\|diagnostic` | Búsqueda médica global |

---

## 2. Pantallas y componentes

### 2.1 Doctor Dashboard (extender)

**Página existente:** dashboard del médico.

**Componente a integrar:** `DoctorDashboardPanels`

```tsx
import { DoctorDashboardPanels } from '@/components';

<DoctorDashboardPanels
  clinicId={clinicId}
  initialSymptoms={['dolor', 'cabeza']}  // opcional: síntomas para CDSS
/>
```

**Contenido:**

| Panel | Descripción | Fuente de datos |
|-------|-------------|-----------------|
| **TodayAppointments** | Citas del día | `fetchAppointments(clinicId)` |
| **RecentPatients** | Últimos 5 pacientes | `fetchPatients(clinicId)` |
| **ClinicalAlerts** | Alertas CDSS | `POST /api/cdss/evaluate` |
| **ClinicTrends** | Tendencias (placeholder) | Pendiente endpoint analytics |

---

### 2.2 Página de consulta (extender)

**Página existente:** consulta médica (telemedicina / EMR).

**Componente a integrar:** `AiConsultationPanel` (panel lateral derecho)

```tsx
import { AiConsultationPanel } from '@/components';

<div className="flex">
  <main>{/* Contenido actual de la consulta */}</main>
  <AiConsultationPanel
    consultationId={consultationId}
    symptoms={symptoms}
    clinicId={clinicId}
    pollInterval={30000}
  />
</div>
```

**Contenido del panel AI:**

1. **CopilotPanel** – Sugerencias del AI Copilot (polling cada 30 s)
2. **ClinicalAlertsPanel** – Alertas CDSS en tiempo real
3. **PredictiveInsightsPanel** – Riesgos y acciones preventivas

**Actualización automática:** el Copilot se actualiza por polling; CDSS y Predictive se recalculan cuando cambian los `symptoms`.

---

### 2.3 Perfil del paciente (extender)

**Página existente:** perfil del paciente.

**Componente a integrar:** `PatientInsightsPanel`

```tsx
import { PatientInsightsPanel } from '@/components';

<div className="flex">
  <main>{/* Perfil actual del paciente */}</main>
  <PatientInsightsPanel
    symptoms={patient.admission_reason?.split(' ') ?? []}
    clinicId={clinicId}
  />
</div>
```

**Contenido:**

- **Clinical Intelligence** – Diagnósticos sugeridos (`/api/clinical-intelligence/suggest`)
- **Predictive risk scores** – Condiciones predichas, scores, acciones preventivas (`/api/predictive-medicine/risk`)

---

### 2.4 Búsqueda médica global

**Extender:** barra de búsqueda existente.

**Componente:** `MedicalSearch`

```tsx
import { MedicalSearch } from '@/components';

<MedicalSearch
  placeholder="Buscar pacientes, diagnósticos..."
  onSelect={(item, type) => {
    if (type === 'patient') navigate(`/patients/${item.id}`);
    // ...
  }}
/>
```

**Tipos de búsqueda:** `patient`, `doctor`, `diagnostic` (vía `GET /api/search`).

---

## 3. Componentes de AI

### 3.1 CopilotPanel

Muestra sugerencias del AI Copilot durante la consulta:

- `symptoms_detected`
- `possible_diagnoses`
- `suggested_questions`
- `recommended_tests` / `suggested_tests`
- `suggested_treatments`

**Props:** `data`, `isLoading`, `error`

---

### 3.2 ClinicalAlertsPanel

Muestra alertas CDSS:

- `diagnostic_alert` – Ej: "Alta probabilidad de hipertensión según síntomas"
- `risk_alert`
- `treatment_alert`
- `preventive_alert`

Cada alerta incluye `severity` (high, medium, low) y estilos visuales diferenciados.

**Props:** `alerts`, `isLoading`

---

### 3.3 PredictiveInsightsPanel

Muestra insights de Predictive Medicine:

- `predicted_conditions`
- `risk_scores`
- `preventive_actions`

**Props:** `predicted_conditions`, `risk_scores`, `preventive_actions`, `isLoading`

---

### 3.4 AiConsultationPanel

Panel contenedor que combina CopilotPanel, ClinicalAlertsPanel y PredictiveInsightsPanel para la página de consulta.

---

### 3.5 DoctorDashboardPanels

Conjunto de paneles para el dashboard: TodayAppointments, RecentPatients, ClinicalAlerts, ClinicTrends.

---

### 3.6 PatientInsightsPanel

Panel lateral para perfil de paciente con Clinical Intelligence y Predictive Medicine.

---

### 3.7 MedicalSearch

Búsqueda global que usa `/api/search` para patients, doctors y diagnostics.

---

## 4. Flujo de consulta médica

```
1. Médico abre consulta
   └─ Obtiene consultationId, clinicId

2. Durante la consulta:
   ├─ Copilot: GET /api/copilot/suggestions?consultationId=X (cada 30 s)
   ├─ CDSS: POST /api/cdss/evaluate { symptoms, context }
   └─ Predictive: POST /api/predictive-medicine/risk { symptoms, context }

3. El médico ve en el panel lateral:
   ├─ Síntomas detectados y diagnósticos posibles
   ├─ Preguntas sugeridas y pruebas recomendadas
   ├─ Alertas clínicas (CDSS)
   └─ Riesgos predictivos y acciones preventivas

4. El médico puede:
   ├─ Usar sugerencias para guiar la entrevista
   ├─ Revisar alertas antes de prescribir
   └─ Considerar acciones preventivas para el paciente
```

---

## 5. Integración con AI

| Módulo backend | Uso en frontend |
|----------------|-----------------|
| **Medical AI Engine** | Copilot, sugerencias de diagnósticos/tratamientos |
| **CDSS** | Alertas diagnósticas, de riesgo, tratamiento y preventivas |
| **Predictive Medicine** | Riesgos, condiciones predichas, acciones preventivas |
| **Clinical Intelligence** | Sugerencias basadas en historial de la clínica |
| **Knowledge Graph** | Enriquecimiento de sugerencias (backend) |
| **Search** | Búsqueda de pacientes, doctores, diagnósticos |

---

## 6. UX para médicos

Principios aplicados:

- **Mínima fricción** – Paneles laterales, sin modales innecesarios
- **Información resumida** – Listas cortas, etiquetas claras
- **Actualización automática** – Polling del Copilot, recálculo al cambiar síntomas
- **Interfaz simple** – Estilos neutros, prioridad a contenido clínico

---

## 7. Funcionalidades de productividad

Ver **[DOCTOR-PRODUCTIVITY.md](./DOCTOR-PRODUCTIVITY.md)** para:

- One-Click Clinical Notes
- Smart Diagnosis Picker
- Auto Treatment Suggestions
- Patient Timeline
- Follow-Up Suggestions
- Quick Orders
- Clinical Shortcuts (Ctrl+D, T, N)

---

## 8. Archivos del frontend

```
frontend/
├── lib/
│   ├── api-ai.ts          # Cliente de APIs AI/CDSS/Predictive/Search
│   └── api-clinic.ts      # Cliente de citas/pacientes
├── components/
│   ├── CopilotPanel.tsx
│   ├── ClinicalAlertsPanel.tsx
│   ├── PredictiveInsightsPanel.tsx
│   ├── AiConsultationPanel.tsx
│   ├── DoctorDashboardPanels.tsx
│   ├── PatientInsightsPanel.tsx
│   ├── MedicalSearch.tsx
│   ├── GenerateClinicalNoteButton.tsx
│   ├── ClinicalNoteEditor.tsx
│   ├── SmartDiagnosisPicker.tsx
│   ├── AutoTreatmentSuggestions.tsx
│   ├── PatientTimeline.tsx
│   ├── FollowUpSuggestions.tsx
│   ├── QuickOrders.tsx
│   └── index.ts
├── hooks/
│   ├── useClinicalShortcuts.ts
│   └── index.ts
└── context/
    └── ClinicContext.tsx  # Proporciona clinicId
```

---

## 9. Requisitos de integración

1. **ClinicContext** – El frontend debe proveer `clinicId` (ej. desde `ClinicProvider`).
2. **Autenticación** – JWT en `localStorage` (`jwt` o `token`) para las llamadas a la API.
3. **API base** – `NEXT_PUBLIC_API_URL` o `window.__API_URL__`.
4. **Páginas existentes** – Los componentes se importan y usan en las páginas actuales; no se crean páginas nuevas.

---

## 10. Ejemplo de integración completa

```tsx
// Página de consulta (ejemplo)
import { useClinic } from '@/context';
import { AiConsultationPanel } from '@/components';

function ConsultationPage() {
  const { clinicId } = useClinic();
  const [consultationId, setConsultationId] = useState(null);
  const [symptoms, setSymptoms] = useState([]);

  return (
    <div className="flex min-h-screen">
      <main className="flex-1 p-6">
        {/* Formulario de consulta, EMR, etc. */}
      </main>
      <AiConsultationPanel
        consultationId={consultationId}
        symptoms={symptoms}
        clinicId={clinicId}
      />
    </div>
  );
}
```
