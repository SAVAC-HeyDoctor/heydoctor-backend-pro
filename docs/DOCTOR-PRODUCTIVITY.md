# Doctor Productivity – Funcionalidades del Workspace

Este documento describe las funcionalidades de productividad del Doctor Workspace en HeyDoctor, cómo ayudan al médico y cómo se integran con AI, CDSS y Predictive Medicine.

---

## 1. One-Click Clinical Notes

### Descripción

Botón **"Generate Clinical Note"** en la pantalla de consulta que genera automáticamente una nota clínica estructurada usando **AI Copilot + Clinical Intelligence**.

### Contenido generado

- **Chief Complaint** – Motivo de consulta en 1-2 frases
- **History of Present Illness** – Historia de la enfermedad actual, evolución, síntomas
- **Assessment** – Evaluación clínica, impresión diagnóstica
- **Plan** – Plan de manejo: tratamiento, estudios, seguimiento

### Flujo

1. El médico hace clic en "Generate Clinical Note"
2. El sistema envía el contexto (consultationId, síntomas, notas, historial) a `POST /api/copilot/generate-clinical-note`
3. La AI genera la nota estructurada
4. Se abre un modal de edición para que el médico revise y modifique
5. El médico guarda la nota

### Integración con AI

- **AI Copilot** – Genera el texto a partir del contexto de la consulta (mensajes, notas, historial)
- **Clinical Intelligence** – El contexto incluye datos históricos del paciente para mayor precisión

### Uso en frontend

```tsx
import { GenerateClinicalNoteButton } from '@/components';

<GenerateClinicalNoteButton
  consultationId={consultationId}
  symptoms={symptoms}
  clinicalNotes={currentNotes}
  patientHistory={patientHistory}
  onSave={(note) => saveToClinicalRecord(note)}
/>
```

---

## 2. Smart Diagnosis Picker

### Descripción

Cuando el médico escribe un diagnóstico, muestra sugerencias automáticas con:

- **Código CIE-10**
- **Nombre del diagnóstico**
- **Probabilidad/confidence** (%)

### Fuentes de datos

- `GET /api/search?type=diagnostic` – Búsqueda de códigos CIE-10
- **Medical AI Engine** (vía `POST /api/cdss/evaluate`) – Diagnósticos sugeridos con confidence

### Flujo

1. El médico escribe en el campo de diagnóstico
2. Tras un debounce (~300 ms), se consultan search y CDSS
3. Se muestran sugerencias combinadas con código, descripción y %
4. El médico selecciona una sugerencia con un clic

### Integración con AI

- **Medical AI Engine** – Predicciones basadas en síntomas y Knowledge Graph
- **CDSS** – Diagnósticos sugeridos con niveles de confianza
- **Search** – Búsqueda de códigos CIE-10 en la base de datos

### Uso en frontend

```tsx
import { SmartDiagnosisPicker } from '@/components';

<SmartDiagnosisPicker
  value={diagnosisInput}
  onChange={(item) => addDiagnosis(item)}
  symptoms={symptoms}
  clinicId={clinicId}
/>
```

---

## 3. Auto Treatment Suggestions

### Descripción

Cuando el médico selecciona un diagnóstico, se muestran automáticamente:

- **treatment_recommendations** – Tratamientos sugeridos con confidence
- **preventive_actions** – Acciones preventivas recomendadas

### Fuentes de datos

- `POST /api/cdss/evaluate` – Con el diagnóstico como síntoma/contexto
- `POST /api/predictive-medicine/risk` – Acciones preventivas

### Flujo

1. El médico selecciona un diagnóstico (desde Smart Diagnosis Picker u otro)
2. El componente llama a CDSS y Predictive Medicine con el diagnóstico
3. Se muestran tratamientos y acciones preventivas
4. El médico puede hacer clic para añadir un tratamiento

### Integración con AI

- **CDSS** – Recomendaciones de tratamiento basadas en guías clínicas
- **Predictive Medicine** – Acciones preventivas según riesgo

### Uso en frontend

```tsx
import { AutoTreatmentSuggestions } from '@/components';

<AutoTreatmentSuggestions
  diagnosis={selectedDiagnosis}
  clinicId={clinicId}
  onSelectTreatment={(name) => addTreatment(name)}
  onSelectPreventive={(action) => addFollowUp(action)}
/>
```

---

## 4. Patient Timeline

### Descripción

Componente **PatientTimeline** que muestra cronológicamente:

- **Consultations** – Citas con doctor y motivo
- **Diagnostics** – Diagnósticos con código CIE-10
- **Treatments** – Tratamientos
- **Documents** – Archivos adjuntos

Formato de timeline visual para entender la historia del paciente rápidamente.

### Fuente de datos

- `GET /api/patients/:id/medical-record` – Registro médico completo

### Integración

El backend devuelve `clinical_record` con `diagnostics` y `treatments` poblados para construir el timeline.

### Uso en frontend

```tsx
import { PatientTimeline } from '@/components';

<PatientTimeline patientId={patientId} />
```

---

## 5. Follow-Up Suggestions

### Descripción

Después de una consulta, muestra **FollowUpSuggestions** con recomendaciones como:

- "Recommended follow-up in 2 weeks"
- "Considerar seguimiento para condición asociada"
- Otras sugerencias basadas en Predictive Medicine y Clinical Intelligence

### Fuentes de datos

- `POST /api/predictive-medicine/risk` – preventive_actions
- `GET /api/clinical-intelligence/suggest` – Sugerencias basadas en historial

### Flujo

1. Al finalizar la consulta, se pasan síntomas y diagnósticos
2. El componente consulta Predictive Medicine y Clinical Intelligence
3. Se muestran sugerencias de seguimiento
4. El médico puede seleccionar una para añadirla al plan

### Uso en frontend

```tsx
import { FollowUpSuggestions } from '@/components';

<FollowUpSuggestions
  symptoms={consultationSymptoms}
  diagnoses={confirmedDiagnoses}
  clinicId={clinicId}
  onSelect={(s) => addFollowUpToPlan(s)}
/>
```

---

## 6. Quick Orders

### Descripción

Panel **QuickOrders** que permite al médico en 1-2 clics:

- **Add diagnostic** – Con Smart Diagnosis Picker integrado
- **Add treatment** – Campo rápido + sugerencias de Auto Treatment
- **Order test** – Ordenar estudio
- **Create prescription** – Crear receta con medicamentos

### Flujo

1. El médico selecciona la pestaña (Diagnóstico, Tratamiento, Estudio, Receta)
2. Para diagnóstico: usa Smart Diagnosis Picker + Auto Treatment Suggestions
3. Para tratamiento: escribe y añade con un clic
4. Para estudio: escribe nombre y ordena
5. Para receta: añade medicamentos y crea la receta

### Integración con AI

- **Smart Diagnosis Picker** – Search + CDSS
- **Auto Treatment Suggestions** – CDSS + Predictive Medicine

### Uso en frontend

```tsx
import { QuickOrders } from '@/components';

<QuickOrders
  onAddDiagnostic={(d) => addDiagnostic(d)}
  onAddTreatment={(t) => addTreatment(t)}
  onOrderTest={(t) => orderTest(t)}
  onCreatePrescription={(items) => createPrescription(items)}
  symptoms={symptoms}
  clinicId={clinicId}
/>
```

---

## 7. Clinical Shortcuts

### Descripción

Atajos de teclado en la consulta para mayor velocidad:

| Shortcut | Acción |
|----------|--------|
| **Ctrl+D** (Cmd+D en Mac) | Add diagnosis – enfoca/abre el selector de diagnóstico |
| **Ctrl+T** (Cmd+T en Mac) | Add treatment – enfoca/abre el selector de tratamiento |
| **Ctrl+N** (Cmd+N en Mac) | Generate clinical note – genera la nota clínica |

### Uso en frontend

```tsx
import { useClinicalShortcuts } from '@/hooks';

function ConsultationPage() {
  const diagnosisRef = useRef<HTMLInputElement>(null);
  const treatmentRef = useRef<HTMLInputElement>(null);

  useClinicalShortcuts({
    onAddDiagnosis: () => diagnosisRef.current?.focus(),
    onAddTreatment: () => treatmentRef.current?.focus(),
    onGenerateNote: () => handleGenerateNote(),
    enabled: true,
  });

  return (
    <>
      <input ref={diagnosisRef} ... />
      <input ref={treatmentRef} ... />
    </>
  );
}
```

---

## 8. Resumen de integración con AI/CDSS

| Funcionalidad | AI Copilot | CDSS | Predictive Medicine | Clinical Intelligence | Search |
|---------------|------------|------|---------------------|------------------------|--------|
| One-Click Clinical Notes | ✓ | | | ✓ (contexto) | |
| Smart Diagnosis Picker | | ✓ | | | ✓ |
| Auto Treatment Suggestions | | ✓ | ✓ | | |
| Patient Timeline | | | | | |
| Follow-Up Suggestions | | | ✓ | ✓ | |
| Quick Orders | | ✓ | ✓ | | ✓ |

---

## 9. APIs utilizadas

| Método | Endpoint | Uso |
|--------|---------|-----|
| POST | `/api/copilot/generate-clinical-note` | Generar nota clínica |
| GET | `/api/search?q=...&type=diagnostic` | Búsqueda de diagnósticos CIE-10 |
| POST | `/api/cdss/evaluate` | Diagnósticos sugeridos, tratamientos, alertas |
| POST | `/api/predictive-medicine/risk` | Riesgos, acciones preventivas |
| GET | `/api/clinical-intelligence/suggest` | Sugerencias basadas en historial |
| GET | `/api/patients/:id/medical-record` | Timeline del paciente |

---

## 10. Flujo de consulta médica con productividad

```
1. Médico abre consulta
   └─ Usa Ctrl+N para generar nota clínica (opcional)
   └─ Edita y guarda

2. Durante la entrevista
   └─ Ctrl+D → abre diagnóstico
   └─ Smart Diagnosis Picker sugiere CIE-10
   └─ Selecciona diagnóstico
   └─ Auto Treatment Suggestions aparecen
   └─ Ctrl+T → añade tratamiento con un clic

3. Quick Orders
   └─ Añade diagnóstico, tratamiento, estudio, receta en 1-2 clics

4. Al finalizar
   └─ FollowUpSuggestions muestra "Seguimiento en 2 semanas"
   └─ Médico añade al plan si aplica

5. En perfil del paciente
   └─ PatientTimeline muestra historial completo
```
