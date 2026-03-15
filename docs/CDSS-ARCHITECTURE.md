# Clinical Decision Support System (CDSS) - HeyDoctor

Sistema formal de soporte a decisiones clínicas que integra todas las capacidades de inteligencia clínica de la plataforma.

## Requisitos

- Strapi, PostgreSQL, Redis
- Al menos uno de: Medical AI Engine, Predictive Medicine, Clinical Intelligence
- ClickHouse (para registro de evaluaciones)
- Multi-tenant basado en `clinic`

## Arquitectura

```
                    ┌─────────────────────────────────────────┐
                    │              CDSS                       │
                    │  analyzeClinicalContext()               │
                    │  generateClinicalAlerts()                │
                    │  generateTreatmentRecommendations()      │
                    │  evaluateRiskLevels()                    │
                    │  generateClinicalGuidance()              │
                    └─────────────────┬───────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ Medical AI    │           │ Predictive      │           │ Clinical        │
│ Engine        │           │ Medicine        │           │ Intelligence    │
│ P(d|s), P(t|d)│           │ RiskScore        │           │ Frecuencia hist.│
└───────────────┘           └─────────────────┘           └─────────────────┘
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │ Knowledge Graph │
                            │ Patrones        │
                            └─────────────────┘
```

## Fuentes de inteligencia

| Fuente | Contribución al CDSS |
|--------|----------------------|
| **Medical AI Engine** | P(diagnosis\|symptoms), tratamientos sugeridos con confidence |
| **Predictive Medicine** | Risk scores, preventive_actions, risk_levels |
| **Clinical Intelligence** | Frecuencia histórica, top_diagnostics, top_treatments |
| **Medical Knowledge Graph** | Diagnósticos relacionados, patrones symptom→diagnosis |

## Entradas del CDSS

| Campo | Tipo | Descripción |
|-------|------|-------------|
| symptoms | string[] | Síntomas reportados |
| context | object | clinic_id, age, gender (anonimizados) |
| clinical_record | object | Registro clínico (opcional) |
| diagnostics | array | Diagnósticos previos (opcional) |
| treatments | array | Tratamientos actuales (opcional) |

## Salida del CDSS

```json
{
  "alerts": [
    {
      "type": "diagnostic_alert",
      "severity": "high",
      "message": "High probability of R51 based on symptoms (confidence: 72%)",
      "code": "R51",
      "confidence": 0.72
    }
  ],
  "suggested_diagnoses": [
    { "code": "R51", "description": "Cefalea", "confidence": 0.72, "source": "medical_ai_engine" }
  ],
  "treatment_recommendations": [
    { "name": "Paracetamol", "confidence": 0.65, "source": "medical_ai_engine" }
  ],
  "preventive_actions": [
    {
      "condition_code": "R51",
      "risk_level": "moderate",
      "recommendation": "Considerar seguimiento para condición asociada (CIE: R51)",
      "type": "follow_up"
    }
  ],
  "risk_levels": [
    { "code": "R51", "risk_score": 0.72, "level": "high", "components": {} }
  ]
}
```

## Tipos de alertas clínicas

| Tipo | Descripción |
|------|-------------|
| diagnostic_alert | Alta probabilidad de diagnóstico basado en síntomas |
| risk_alert | Riesgo elevado para condición |
| treatment_alert | Tratamiento frecuentemente asociado con síntomas |
| preventive_alert | Acción preventiva recomendada |

Severidades: `high`, `medium`, `info`

## Flujo de decisión clínica

1. **Análisis de contexto**: Se parsean síntomas, context y datos clínicos.
2. **Consulta paralela**: Se consultan Medical AI Engine, Predictive Medicine, Clinical Intelligence y Knowledge Graph.
3. **Generación de alertas**: Se crean alertas según umbrales de confidence y risk_score.
4. **Recomendaciones**: Se fusionan tratamientos de todas las fuentes.
5. **Niveles de riesgo**: Se evalúan y clasifican (high/medium/low).
6. **Registro**: Se emite evento `cdss_evaluated` a ClickHouse.

## API

### POST /api/cdss/evaluate

**Input:**
```json
{
  "symptoms": ["dolor", "cabeza", "fiebre"],
  "context": { "clinic_id": 1, "age": 45, "gender": "M" }
}
```

**Output:** Estructura completa de salida del CDSS (ver arriba).

**Permisos:** Usuario autenticado con tenant-resolver (clínica requerida).

## Integración

### AI Copilot

Cuando el Copilot devuelve sugerencias con `symptoms_detected`, el CDSS enriquece con alertas, risk_levels y preventive_actions.

### Clinical Intelligence

El endpoint `GET /api/clinical-intelligence/suggest` enriquece con evaluación CDSS completa.

### Predictive Medicine

El endpoint `POST /api/predictive-medicine/risk` enriquece con alertas y risk_levels del CDSS.

## Eventos

### cdss_evaluated

Se emite en cada evaluación para registro en ClickHouse:

- **event_type**: `cdss_evaluated`
- **metadata**: `{ symptoms_count, alerts_count, diagnoses_count, treatments_count }`

Permite análisis de uso y auditoría del sistema.

## Seguridad

- **Solo datos agregados o anonimizados**
- **Sin PII**: no nombres, emails, IDs de paciente
- **Contexto paciente**: edad y sexo opcionales, nunca identificadores
- **Aislamiento por clínica**: filtrado por clinic_id

## Uso para médicos

El CDSS es una **herramienta de apoyo** que:

1. Consolida sugerencias de múltiples fuentes de inteligencia
2. Genera alertas según umbrales de probabilidad y riesgo
3. Proporciona recomendaciones de tratamiento basadas en datos agregados
4. Sugiere acciones preventivas

**No sustituye el juicio clínico.** El médico debe validar siempre con el paciente y el contexto completo. Las sugerencias se basan en patrones históricos agregados de la plataforma.
