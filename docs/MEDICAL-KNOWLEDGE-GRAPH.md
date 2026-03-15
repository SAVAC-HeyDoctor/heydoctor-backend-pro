# Medical Knowledge Graph - HeyDoctor

Grafo de conocimiento médico basado en datos clínicos agregados de la plataforma.

## Requisitos

- Strapi, PostgreSQL, ClickHouse
- Clinical Intelligence (opcional, para enriquecimiento)
- Multi-tenant basado en `clinic`

## Arquitectura

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  clinical_record    │     │  diagnostic          │     │  treatment       │
│  admission_reason   │────▶│  cie_10_code         │────▶│  name            │
│  observations       │     │                      │     │                  │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
         │                            │                            │
         └────────────────────────────┴────────────────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │  medical_graph_edges     │
                         │  (ClickHouse)           │
                         └─────────────────────────┘
```

## Estructura del grafo

### Nodos

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| symptom | `symptom:{término}` | symptom:dolor, symptom:cabeza |
| diagnosis | `diagnosis:{CIE10}` | diagnosis:R51, diagnosis:G43 |
| treatment | `treatment:{nombre}` | treatment:paracetamol |

### Relaciones

| Tipo | Origen | Destino |
|------|--------|---------|
| symptom_diagnosis | symptom | diagnosis |
| symptom_treatment | symptom | treatment |
| diagnosis_treatment | diagnosis | treatment |
| diagnosis_diagnosis | diagnosis | diagnosis (comorbilidades) |

### Almacenamiento (ClickHouse)

Tabla: `medical_graph_edges`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| source_node | String | Nodo origen |
| target_node | String | Nodo destino |
| relationship_type | String | Tipo de relación |
| weight | Float64 | Peso (frecuencia de co-ocurrencia) |
| clinic_id | Nullable(UInt64) | Clínica (multi-tenant) |
| timestamp | DateTime64(3) | Fecha de construcción |

## Módulo

`modules/knowledge-graph`

### Funciones

#### `buildKnowledgeGraph(options?)`

Construye el grafo desde clinical_record, diagnostic, treatment.

- `options.clinicId`: filtra por clínica
- `options.clear`: si false, no borra antes (default: true)

#### `updateKnowledgeGraph(options?)`

Actualiza el grafo (equivalente a build con clear: true).

#### `queryKnowledgeGraph(symptoms, clinicId?, options?)`

Consulta el grafo dado síntomas. Devuelve diagnósticos, tratamientos y condiciones relacionadas (comorbilidades).

#### `enrichClinicalSuggestions(symptoms, clinicId, baseSuggestions)`

Enriquece las sugerencias de Clinical Intelligence con datos del grafo.

## Fuentes de datos

| Fuente | Campo | Uso |
|--------|-------|-----|
| clinical_record | admission_reason | Extracción de términos síntoma |
| clinical_record | observations | Términos adicionales |
| diagnostic | cie_10_code | Nodo diagnosis |
| treatment | name | Nodo treatment |

## Algoritmo

1. **Co-ocurrencias**: por cada clinical_record, se extraen términos de admission_reason y observations.
2. **Edges**: se crean aristas por cada par (symptom, diagnosis), (symptom, treatment), (diagnosis, treatment), (diagnosis, diagnosis) que co-ocurren en el mismo registro.
3. **Peso**: suma de co-ocurrencias, agregado por (source, target, type, clinic_id).

## API

### GET /api/knowledge-graph/query

**Query:** `symptoms` (requerido)

**Respuesta:**
```json
{
  "diagnoses": [
    { "code": "R51", "description": "Cefalea", "weight": 15 }
  ],
  "treatments": [
    { "name": "paracetamol", "weight": 12 }
  ],
  "related_conditions": [
    { "code": "G43", "description": "Migraña", "weight": 5 }
  ]
}
```

### POST /api/knowledge-graph/build

Encola la construcción del grafo. Opcional: `?clinic_id=X` para una clínica específica.

## Construcción del grafo

- **Manual**: `POST /api/knowledge-graph/build`
- **Programada**: Job BullMQ semanal (domingo 3:00 AM, cron: `0 3 * * 0`)
- Requiere: `CLICKHOUSE_URL` y `REDIS_URL`

## Integración con Clinical Intelligence

Cuando el Knowledge Graph está habilitado, el endpoint `GET /api/clinical-intelligence/suggest` enriquece automáticamente las sugerencias con:

- Diagnósticos adicionales del grafo
- Tratamientos adicionales del grafo
- `related_conditions`: comorbilidades frecuentes

## Seguridad

- **Solo datos agregados**: pesos y frecuencias, sin datos de pacientes
- **Aislamiento por clínica**: filtrado por clinic_id cuando aplica
- **Sin PII**: no se almacenan nombres, IDs de paciente ni datos identificables

## Uso futuro para AI médica

El grafo puede extenderse para:

- **Embeddings**: nodos y relaciones como vectores para búsqueda semántica
- **RAG**: recuperación de contexto clínico para LLMs
- **Recomendaciones**: sugerencias basadas en grafos de conocimiento
- **Detección de patrones**: anomalías, clusters de diagnósticos
