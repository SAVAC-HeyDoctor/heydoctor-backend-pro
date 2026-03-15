# Predictive Medicine - HeyDoctor

Plataforma de medicina predictiva basada en datos clínicos agregados. Calcula scores de riesgo y recomendaciones preventivas sin usar datos identificables de pacientes.

## Requisitos

- Strapi, PostgreSQL, Redis
- Medical AI Engine (recomendado)
- Clinical Intelligence
- Medical Knowledge Graph (recomendado)
- ClickHouse (para detección de patrones)

## Arquitectura

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Medical AI Engine  │  │ Clinical Intelligence│  │  Knowledge Graph    │
│  P(d|s)             │  │ historical frequency │  │  pattern strength   │
└─────────┬───────────┘  └──────────┬──────────┘  └──────────┬──────────┘
          │                         │                        │
          └─────────────────────────┼────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  Predictive Medicine          │
                    │  RiskScore = 0.5*AI + 0.3*Hist + 0.2*Pattern │
                    └───────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   AI Copilot              Clinical Intelligence       Medical AI Engine
```

## Fuentes de datos

| Fuente | Uso |
|--------|-----|
| **Medical AI Engine** | P(diagnosis\|symptoms), confidence scores |
| **Clinical Intelligence** | Frecuencia histórica en registros |
| **Knowledge Graph** | Fuerza de patrones symptom→diagnosis |
| **ClickHouse events** | Tendencias por clínica, eventos agregados |
| **medical_graph_edges** | Clusters de síntomas, diagnósticos recurrentes |

Solo datos agregados. Nunca nombres, emails, IDs de paciente ni documentos clínicos completos.

## Modelo heurístico

### RiskScore

Combinación ponderada de tres componentes:

```
RiskScore = 0.5 × P(diagnosis|symptoms)     [Medical AI Engine]
          + 0.3 × historical_frequency      [Clinical Intelligence]
          + 0.2 × pattern_strength          [Knowledge Graph]
```

- **P(diagnosis|symptoms)**: probabilidad del Medical AI Engine (0-1)
- **historical_frequency**: frecuencia normalizada en clinical records (0-1)
- **pattern_strength**: peso normalizado en el grafo (0-1)

### Pesos configurables

```javascript
WEIGHTS = {
  ai_confidence: 0.5,
  historical_frequency: 0.3,
  pattern_strength: 0.2,
}
```

## Módulo

`modules/predictive-medicine`

### Funciones

| Función | Descripción |
|---------|-------------|
| `calculateRiskScores(symptoms, clinicId?, options?)` | Calcula scores de riesgo por condición |
| `predictHealthRisks(symptoms, clinicId?, options?)` | Predicción completa con condiciones, scores y acciones preventivas |
| `detectClinicalPatterns(clinicId?, options?)` | Detecta clusters de síntomas, diagnósticos recurrentes, tendencias |
| `generatePreventiveRecommendations(conditions, clinicId?, options?)` | Genera recomendaciones preventivas |
| `enrichSuggestions(symptoms, clinicId, baseResult)` | Enriquece sugerencias de otros módulos |

## Detección de patrones

`detectClinicalPatterns()` analiza:

- **symptom_clusters**: síntomas con más diagnósticos asociados (desde KG)
- **recurrent_diagnoses**: diagnósticos más frecuentes (desde KG)
- **clinic_trends**: eventos por día y tipo (desde ClickHouse)

## API

### POST /api/predictive-medicine/risk

**Input:**
```json
{
  "symptoms": ["dolor", "cabeza", "fiebre"],
  "context": { "clinic_id": 1 }
}
```

**Output:**
```json
{
  "predicted_conditions": [
    { "code": "R51", "description": "Cefalea", "risk_score": 0.72 }
  ],
  "risk_scores": [
    {
      "code": "R51",
      "risk_score": 0.72,
      "components": {
        "ai_confidence": 0.65,
        "historical_frequency": 0.8,
        "pattern_strength": 0.7
      }
    }
  ],
  "preventive_actions": [
    {
      "condition_code": "R51",
      "risk_level": "moderate",
      "recommendation": "Considerar seguimiento para condición asociada (CIE: R51)",
      "type": "follow_up"
    }
  ],
  "meta": { "engine_enabled": true }
}
```

**Permisos:** Usuario autenticado con tenant-resolver (clínica requerida).

## Integración

### AI Copilot

Cuando el Copilot devuelve `symptoms_detected`, enriquece con condiciones predichas y `preventive_actions`.

### Clinical Intelligence

El endpoint `GET /api/clinical-intelligence/suggest` enriquece con predicciones y acciones preventivas del módulo.

### Medical AI Engine

Puede consumir `predictHealthRisks` para añadir risk_scores a sus predicciones (integración opcional en capa API).

## Jobs

### predictive-model-refresh

- **Frecuencia**: Diaria a las 5:00 AM (cron: `0 5 * * *`)
- **Acción**: Ejecuta `detectClinicalPatterns` para mantener patrones actualizados

## Seguridad

- **Solo datos agregados**: scores, frecuencias, patrones
- **Sin PII**: no nombres, emails, IDs de paciente
- **Sin documentos clínicos completos**: solo códigos CIE y conteos
- **Aislamiento por clínica**: filtrado por clinic_id cuando aplica

## Uso clínico

Los risk scores son **herramientas de apoyo** para el médico. No sustituyen el juicio clínico. Las recomendaciones preventivas son sugerencias basadas en patrones agregados de la plataforma. El médico debe validar siempre con el paciente y el contexto clínico completo.
