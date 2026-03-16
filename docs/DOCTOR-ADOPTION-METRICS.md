# Doctor Adoption Metrics – Métricas de Adopción Clínica

Este documento describe las métricas de adopción clínica en HeyDoctor, cómo se calculan y por qué son importantes para producto e inversión.

---

## 1. Objetivo

Medir si los médicos se vuelven **dependientes del sistema** y si la plataforma mejora su productividad. Las métricas se almacenan en **ClickHouse** usando la infraestructura de analytics existente.

---

## 2. Daily Active Doctors (DAD)

### Definición

Número de médicos que realizan **al menos una acción clínica** en un día.

### Eventos que cuentan

- `consultation_started`
- `clinical_note_generated`
- `diagnostic_added`
- `treatment_added`
- `cdss_evaluated`

### Cálculo

```sql
SELECT count(DISTINCT user_id) as cnt
FROM events
WHERE event_type IN (...)
  AND user_id IS NOT NULL
  AND toDate(timestamp) = today()
```

### Output

```json
{
  "daily_active_doctors": 12,
  "date": "2025-03-07"
}
```

### Importancia

- **Producto:** Indica cuántos médicos usan la plataforma cada día.
- **Inversión:** Métrica de engagement diario; base para retención y crecimiento.

---

## 3. Consultation Completion Time

### Definición

Tiempo promedio (minutos) que tarda un médico en completar una consulta.

### Eventos usados

- `consultation_started` – inicio
- `consultation_completed` / `consultation_ended` / `clinical_note_generated` – fin

### Cálculo

Se calcula la diferencia entre el primer evento de inicio y el primer evento de fin por consulta (appointment), y se promedia.

### Output

```json
{
  "avg_consultation_minutes": 18
}
```

### Importancia

- **Producto:** Indica eficiencia del flujo clínico.
- **Inversión:** Menor tiempo por consulta = mayor capacidad sin aumentar costos.

---

## 4. AI Assistance Rate

### Definición

Porcentaje de consultas en las que el médico usó al menos una herramienta de AI.

### Eventos de AI

- `copilot_suggestions_used`
- `cdss_evaluated`
- `predictive_medicine_used`

### Cálculo

```
ai_usage_rate = (consultas con al menos 1 evento AI) / total_consultas * 100
```

### Output

```json
{
  "ai_usage_rate": 67.5
}
```

### Importancia

- **Producto:** Mide adopción de AI Copilot, CDSS y Predictive Medicine.
- **Inversión:** Alto uso de AI = diferenciación y valor percibido.

---

## 5. Clinical Actions Per Consultation

### Definición

Número promedio de acciones clínicas por consulta.

### Acciones

- `diagnostic_added`
- `treatment_added`
- `prescription_created`
- `test_ordered`

### Cálculo

Se cuentan los eventos de acción por consulta (entity_id = appointment) y se promedia.

### Output

```json
{
  "avg_actions_per_consultation": 3.2
}
```

### Importancia

- **Producto:** Indica completitud del registro clínico.
- **Inversión:** Más acciones = más valor generado por consulta.

---

## 6. Doctor Stickiness Score

### Definición

Métrica compuesta que combina varios indicadores de adopción.

### Fórmula

```
stickiness_score =
  (consultations_per_doctor * 0.4) +
  (ai_usage_rate * 0.3) +
  (reminders_created_rate * 0.3)
```

Donde:

- `consultations_per_doctor` = total consultas / médicos únicos
- `ai_usage_rate` = 0–1 (porcentaje / 100)
- `reminders_created_rate` = min(1, recordatorios_creados / consultas)

### Niveles de adopción

| Score | Nivel |
|-------|-------|
| ≥ 0.6 | high |
| ≥ 0.3 | medium |
| < 0.3 | low |

### Output

```json
{
  "stickiness_score": 0.52,
  "adoption_level": "medium"
}
```

### Importancia

- **Producto:** Resumen de adopción y dependencia del sistema.
- **Inversión:** Score alto = médicos más “enganchados” y menor churn.

---

## 7. API Endpoint

### GET /api/analytics/doctor-adoption

**Query params:**

- `days` (opcional): 1–90, default 7
- `clinic_id` (opcional): filtra por clínica (usa tenant-resolver si no se pasa)

**Respuesta:**

```json
{
  "daily_active_doctors": 12,
  "date": "2025-03-07",
  "avg_consultation_minutes": 18,
  "ai_usage_rate": 67.5,
  "avg_actions_per_consultation": 3.2,
  "stickiness_score": 0.52,
  "adoption_level": "medium",
  "meta": {
    "analytics_enabled": true,
    "days": 7,
    "clinic_id": 1
  }
}
```

---

## 8. Event Tracking

Eventos emitidos con `analytics.trackEvent()`:

| Evento | Origen |
|--------|--------|
| `consultation_started` | consultations.service (CONSULTATION_STARTED) |
| `consultation_completed` | consultation_ended |
| `clinical_note_generated` | copilot.generateClinicalNote |
| `diagnostic_added` | diagnostic lifecycle (afterCreate) |
| `treatment_added` | treatment lifecycle (afterCreate) |
| `prescription_created` | medication lifecycle (afterCreate) |
| `reminder_created` | patient-reminder lifecycle (afterCreate) |
| `copilot_suggestions_used` | copilot.suggestions |
| `cdss_evaluated` | cdss.evaluate |
| `predictive_medicine_used` | predictive-medicine.risk |

---

## 9. Doctor Analytics Panel (Frontend)

Componente `DoctorAnalyticsPanel` en el Doctor Dashboard que muestra:

- **Médicos activos hoy** (DAD)
- **Uso de AI (%)**
- **Tiempo consulta (min)**
- **Stickiness Score** (con nivel: low/medium/high)

**Uso:**

```tsx
import { DoctorAnalyticsPanel } from '@/components';

<DoctorAnalyticsPanel days={7} />
```

Integrado en `DoctorDashboardPanels`.

---

## 10. Requisitos

- **CLICKHOUSE_URL** configurado para persistir eventos.
- **REDIS_URL** para BullMQ (cola analytics-worker).
- Usuario autenticado con `clinicId` (tenant-resolver).

---

## 11. Resumen para inversión

| Métrica | Qué mide | Por qué importa |
|---------|----------|------------------|
| **DAD** | Engagement diario | Base de retención |
| **Consultation Time** | Eficiencia | Capacidad y costos |
| **AI Usage Rate** | Adopción de AI | Diferenciación |
| **Actions/Consultation** | Completitud clínica | Valor por consulta |
| **Stickiness Score** | Dependencia del sistema | Churn y LTV |
