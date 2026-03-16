# Clinical Safety, FHIR Interoperability y Compliance

Documentación técnica de las capas de seguridad clínica, interoperabilidad FHIR y base de cumplimiento médico en HeyDoctor.

---

## 1. FHIR Interoperability Layer

### Ubicación

- **Módulo:** `modules/fhir/`
- **API:** `src/api/fhir/`
- **Endpoints:** `GET /api/fhir/patient/:id`, `GET /api/fhir/encounter/:id`, `GET /api/fhir/observation/:id`

### Recursos FHIR R4 implementados

| Recurso FHIR | Entidad Strapi | Descripción |
|--------------|----------------|-------------|
| **Patient** | `patient` | Paciente con identificadores, nombre, género, fecha de nacimiento, telecom, dirección |
| **Practitioner** | `doctor` | Médico con identificador y nombre |
| **Encounter** | `consultation` / `appointment` | Encuentro clínico (consulta/cita) |
| **Observation** | `clinical_record` / `diagnostic` | Observación clínica o resultado diagnóstico |
| **MedicationRequest** | `medication` / `prescription` | Solicitud de medicación |

### Convertidores Strapi ↔ FHIR

- `modules/fhir/converters/patient.js` — Patient
- `modules/fhir/converters/practitioner.js` — Practitioner
- `modules/fhir/converters/encounter.js` — Encounter
- `modules/fhir/converters/observation.js` — Observation
- `modules/fhir/converters/medication-request.js` — MedicationRequest

### Formato de respuesta

Todas las respuestas siguen el estándar **FHIR R4 JSON**:

```json
{
  "resourceType": "Patient",
  "id": "123",
  "meta": { "profile": ["http://hl7.org/fhir/StructureDefinition/Patient"] },
  "name": [{ "use": "official", "family": "Doe", "given": ["John"] }],
  "gender": "male",
  "birthDate": "1990-01-15",
  "telecom": [{ "system": "phone", "value": "+1234567890" }]
}
```

### Uso

```bash
GET /api/fhir/patient/1
GET /api/fhir/encounter/5
GET /api/fhir/observation/10?type=clinical_record
GET /api/fhir/observation/12?type=diagnostic
```

---

## 2. AI Clinical Safety Layer

### Ubicación

- **Módulo:** `modules/clinical-safety/index.js`
- **Integración:** CDSS, Copilot, Medical AI Engine

### Funciones principales

| Función | Descripción |
|---------|-------------|
| `validateAiSuggestion(suggestion, context)` | Valida una sugerencia AI y añade `confidence`, `risk_flag`, `explanation` |
| `calculateConfidenceThreshold(context)` | Calcula umbral de confianza según severidad, edad, tipo de condición |
| `checkClinicalRisk(suggestion, context)` | Evalúa riesgo clínico y si está por debajo del umbral |
| `enrichSuggestions(suggestions, context)` | Enriquece arrays de diagnósticos/tratamientos sugeridos con validación |

### Flujo de validación

```
AI suggestion → clinical safety validation → return to doctor
```

### Campos añadidos a las sugerencias

- **confidence** / **confidence_score**: 0–1 (ej. 0.82)
- **risk_flag**: `true` si alta confianza en diagnóstico/tratamiento crítico
- **explanation**: texto explicativo para el médico

### Ejemplo de respuesta enriquecida

```json
{
  "diagnosis": "Hypertension",
  "confidence": 0.82,
  "confidence_score": 0.82,
  "risk_flag": false,
  "explanation": "Based on symptoms and clinical patterns"
}
```

### Umbrales por defecto

- Umbral base: 0.5
- Severidad alta / condición crítica: 0.7
- Paciente menor de 18 años: 0.65
- Riesgo alto (risk_flag): confianza ≥ 0.9 en diagnóstico/tratamiento

---

## 3. Medical Compliance Base

### Ubicación

- **Módulo:** `modules/compliance/index.js`
- **Persistencia:** ClickHouse (analytics) + PostgreSQL (audit_log)

### Eventos registrados

| Evento | Cuándo se registra |
|--------|--------------------|
| `clinical_decision_made` | Decisión clínica tomada por el médico |
| `ai_recommendation_viewed` | El médico visualiza una recomendación AI |
| `diagnostic_confirmed` | Se confirma un diagnóstico (lifecycle `diagnostic` afterCreate) |
| `treatment_applied` | Se aplica un tratamiento (lifecycle `treatment` afterCreate) |

### Funciones de logging

```javascript
compliance.logClinicalDecision({ userId, patientId, clinicId, ... });
compliance.logAiRecommendationViewed({ userId, recommendationId, ... });
compliance.logDiagnosticConfirmed({ diagnosticId, doctorId, patientId, clinicId, consultationId });
compliance.logTreatmentApplied({ treatmentId, clinicId, patientId, clinicalRecordId });
```

### Integración automática

- **Diagnóstico:** `src/api/diagnostic/content-types/diagnostic/lifecycles.js` → `logDiagnosticConfirmed` en `afterCreate`
- **Tratamiento:** `src/api/treatment/content-types/treatment/lifecycles.js` → `logTreatmentApplied` en `afterCreate`

### Destinos de los logs

1. **ClickHouse:** vía `analytics.trackEvent()` para análisis y dashboards
2. **PostgreSQL:** vía `auditLogger` para auditoría y compliance (eventos críticos)

---

## 4. Field-level Encryption (Seguridad)

### Ubicación

- **Utilidad:** `src/utils/field-encryption.js`
- **Algoritmo:** AES-256-GCM

### Configuración

Variable de entorno:

- `FIELD_ENCRYPTION_KEY` o `FILE_ENCRYPTION_KEY` (64 caracteres hex)

Generar clave:

```bash
openssl rand -hex 32
```

### Campos cifrados

- `patient.phone`
- `patient.email` (si se integra)
- Documentos clínicos sensibles (si se integra)

### Comportamiento

- Si la clave no está definida: el cifrado está deshabilitado (no-op)
- Prefijo en valores cifrados: `enc:`
- Cifrado en `beforeCreate` / `beforeUpdate`
- Descifrado en `afterCreate` / `afterUpdate` para lectura

### Uso programático

```javascript
const fieldEncryption = require("./utils/field-encryption");

if (fieldEncryption.isFieldEncryptionEnabled()) {
  data.phone = fieldEncryption.encryptField(data.phone);
}
result.phone = fieldEncryption.decryptField(result.phone);
```

---

## 5. Doctor UI Integration

### Componentes actualizados

- **CopilotPanel:** muestra `confidence` (%), `explanation` en diagnósticos y tratamientos sugeridos
- **ClinicalAlertsPanel:** muestra `confidence` y `explanation` en alertas clínicas
- **AutoTreatmentSuggestions:** muestra porcentaje de confianza y explicación en sugerencias de tratamiento

### Ejemplo visual

```
Hypertension (82% confidence)
Explanation: Based on symptoms and clinical patterns.
```

---

## 6. Resumen de arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     HeyDoctor Backend                             │
├─────────────────────────────────────────────────────────────────┤
│  Strapi + PostgreSQL + Redis + BullMQ + ClickHouse               │
├─────────────────────────────────────────────────────────────────┤
│  FHIR Layer        │  Clinical Safety  │  Compliance             │
│  modules/fhir      │  modules/         │  modules/compliance     │
│  Patient, Encounter│  clinical-safety  │  diagnostic_confirmed   │
│  Observation, etc. │  validateAi...    │  treatment_applied      │
│  Strapi ↔ FHIR     │  enrichSuggestions│  audit_log + analytics  │
├─────────────────────────────────────────────────────────────────┤
│  Field Encryption (AES-256-GCM) - patient.phone, etc.           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Referencias

- [FHIR R4](https://hl7.org/fhir/R4/)
- [HL7 Patient Resource](https://hl7.org/fhir/R4/patient.html)
- [HL7 Observation Resource](https://hl7.org/fhir/R4/observation.html)
