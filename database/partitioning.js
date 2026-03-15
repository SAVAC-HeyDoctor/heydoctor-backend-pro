"use strict";

/**
 * Utilidades para partición futura de tablas grandes.
 * No aplica particiones aún; prepara la estructura y documenta la estrategia.
 *
 * Tablas candidatas: appointments, messages, audit_logs
 * Claves de partición: clinic_id, created_at
 */

const PARTITION_CANDIDATES = [
  { table: "appointments", partitionKey: "clinic_id", rangeKey: "created_at", strategy: "RANGE(created_at) o LIST(clinic_id)+RANGE(created_at)" },
  { table: "messages", partitionKey: null, rangeKey: "created_at", strategy: "RANGE(created_at)" },
  { table: "audit_logs", partitionKey: "clinic_id", rangeKey: "created_at", strategy: "RANGE(created_at) o LIST(clinic_id)+RANGE(created_at)" },
];

/**
 * Verifica que las tablas tengan las columnas necesarias para partición futura.
 * Útil para validar antes de migrar a particiones.
 */
function getPartitionReadiness(connection) {
  return PARTITION_CANDIDATES;
}

/**
 * Genera SQL de ejemplo para partición por RANGE (created_at).
 * No ejecuta; solo documenta la estrategia.
 */
function getPartitionExampleSQL(table, partitionKey, rangeKey) {
  return `
-- Ejemplo de partición futura para ${table}
-- Estrategia: RANGE por ${rangeKey}, con subpartición por ${partitionKey} si se requiere

-- 1. Crear tabla particionada (requiere migración)
-- CREATE TABLE ${table}_partitioned (LIKE ${table} INCLUDING ALL) PARTITION BY RANGE (${rangeKey});

-- 2. Crear particiones por rango de fechas (ej: mensual)
-- CREATE TABLE ${table}_2025_01 PARTITION OF ${table}_partitioned
--   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- 3. Para partición por clinic_id (LIST) + created_at (RANGE):
-- PARTITION BY LIST (${partitionKey});
-- CREATE TABLE ${table}_clinic_1 PARTITION OF ${table}_partitioned
--   FOR VALUES IN (1) PARTITION BY RANGE (${rangeKey});
`;
}

module.exports = {
  PARTITION_CANDIDATES,
  getPartitionReadiness,
  getPartitionExampleSQL,
};
