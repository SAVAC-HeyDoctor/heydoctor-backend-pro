import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type TableGrowthMetric = {
  table: string;
  rowCount: number;
  totalBytes: number;
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
};

type OrphanMetric = {
  name: string;
  count: number;
  severity: 'ok' | 'warning';
};

type RetentionPolicy = {
  auditLogRetentionDays: number;
  productEventRetentionDays: number;
  webrtcMetricRetentionDays: number;
  outboxRetentionDays: number;
  clinicalRecordRetentionYears: number;
  legalBasis: string;
};

type BackupVisibility = {
  provider: 'railway_postgres' | 'external' | 'unknown';
  configured: boolean;
  recoveryRunbookConfigured: boolean;
  lastRestoreDrillAt: string | null;
  notes: string[];
};

export type DataReliabilityDiagnostics = {
  generatedAt: string;
  backup: BackupVisibility;
  retention: RetentionPolicy;
  tableGrowth: TableGrowthMetric[];
  orphanChecks: OrphanMetric[];
  deletionBacklog: {
    pending: number;
    processing: number;
    failed: number;
    oldestPendingCreatedAt: string | null;
  };
  riskSummary: {
    status: 'ok' | 'needs_attention';
    risks: string[];
  };
};

type CountRow = { count: string };
type TimestampBoundsRow = {
  oldest: Date | string | null;
  newest: Date | string | null;
};
type TableSizeRow = { total_bytes: string | number | null };
type DeletionBacklogRow = {
  pending: string;
  processing: string;
  failed: string;
  oldest_pending: Date | string | null;
};

const TRACKED_TABLES = [
  'audit_logs',
  'consultations',
  'patients',
  'telemedicine_consents',
  'gdpr_deletion_requests',
  'event_outbox',
  'product_events',
  'webrtc_metric_samples',
  'payku_payments',
  'financial_ledger',
] as const;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = Number(env(name));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function count(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

@Injectable()
export class OpsDataReliabilityService {
  constructor(private readonly dataSource: DataSource) {}

  async getDiagnostics(): Promise<DataReliabilityDiagnostics> {
    const [tableGrowth, orphanChecks, deletionBacklog] = await Promise.all([
      this.tableGrowth(),
      this.orphanChecks(),
      this.deletionBacklog(),
    ]);
    const backup = this.backupVisibility();
    const retention = this.retentionPolicy();
    const risks = this.risks(
      backup,
      tableGrowth,
      orphanChecks,
      deletionBacklog,
    );

    return {
      generatedAt: new Date().toISOString(),
      backup,
      retention,
      tableGrowth,
      orphanChecks,
      deletionBacklog,
      riskSummary: {
        status: risks.length > 0 ? 'needs_attention' : 'ok',
        risks,
      },
    };
  }

  private backupVisibility(): BackupVisibility {
    const provider = env('BACKUP_PROVIDER');
    const railwayEnvironment = env('RAILWAY_ENVIRONMENT');
    const configured =
      env('BACKUP_CONFIGURED') === 'true' ||
      env('RAILWAY_POSTGRES_BACKUPS') === 'true' ||
      Boolean(env('BACKUP_PROVIDER'));
    const recoveryRunbookConfigured = Boolean(env('RECOVERY_RUNBOOK_URL'));

    return {
      provider:
        provider === 'railway_postgres' || railwayEnvironment
          ? 'railway_postgres'
          : provider
            ? 'external'
            : 'unknown',
      configured,
      recoveryRunbookConfigured,
      lastRestoreDrillAt: env('LAST_RESTORE_DRILL_AT'),
      notes: [
        configured
          ? 'Backup configuration flag is present.'
          : 'No backup configuration flag found; verify Railway Postgres backups outside the app.',
        recoveryRunbookConfigured
          ? 'Recovery runbook URL is configured.'
          : 'No recovery runbook URL configured.',
      ],
    };
  }

  private retentionPolicy(): RetentionPolicy {
    return {
      auditLogRetentionDays: numberFromEnv('AUDIT_LOG_RETENTION_DAYS', 2555),
      productEventRetentionDays: numberFromEnv(
        'PRODUCT_EVENT_RETENTION_DAYS',
        730,
      ),
      webrtcMetricRetentionDays: numberFromEnv(
        'WEBRTC_METRIC_RETENTION_DAYS',
        90,
      ),
      outboxRetentionDays: numberFromEnv('OUTBOX_RETENTION_DAYS', 90),
      clinicalRecordRetentionYears: numberFromEnv(
        'CLINICAL_RECORD_RETENTION_YEARS',
        15,
      ),
      legalBasis:
        'Clinical records are retained for legal/medical continuity; operational telemetry should be pruned by explicit retention jobs.',
    };
  }

  private async tableGrowth(): Promise<TableGrowthMetric[]> {
    const metrics: TableGrowthMetric[] = [];
    for (const table of TRACKED_TABLES) {
      const [{ count: rowCount }, bounds, size] = await Promise.all([
        this.dataSource
          .query<CountRow[]>(`SELECT COUNT(*)::text AS count FROM ${table}`)
          .then((rows) => rows[0]),
        this.dataSource
          .query<
            TimestampBoundsRow[]
          >(`SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM ${table}`)
          .then((rows) => rows[0]),
        this.dataSource
          .query<
            TableSizeRow[]
          >(`SELECT pg_total_relation_size($1::regclass)::text AS total_bytes`, [table])
          .then((rows) => rows[0]),
      ]);
      metrics.push({
        table,
        rowCount: Number(rowCount),
        totalBytes: Number(size?.total_bytes ?? 0),
        oldestCreatedAt: toIso(bounds?.oldest),
        newestCreatedAt: toIso(bounds?.newest),
      });
    }
    return metrics;
  }

  private async orphanChecks(): Promise<OrphanMetric[]> {
    const checks: Array<{ name: string; sql: string }> = [
      {
        name: 'consultations_missing_patient',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM consultations c
          LEFT JOIN patients p ON p.id = c.patient_id
          WHERE p.id IS NULL
        `,
      },
      {
        name: 'consultations_missing_clinic',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM consultations c
          LEFT JOIN clinics cl ON cl.id = c.clinic_id
          WHERE cl.id IS NULL
        `,
      },
      {
        name: 'patients_missing_clinic',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM patients p
          LEFT JOIN clinics cl ON cl.id = p.clinic_id
          WHERE cl.id IS NULL
        `,
      },
      {
        name: 'audit_logs_missing_clinic',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM audit_logs a
          LEFT JOIN clinics cl ON cl.id = a.clinic_id
          WHERE cl.id IS NULL
        `,
      },
      {
        name: 'payments_missing_clinic',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM payku_payments p
          LEFT JOIN clinics cl ON cl.id = p.clinic_id
          WHERE cl.id IS NULL
        `,
      },
      {
        name: 'subscription_events_missing_clinic',
        sql: `
          SELECT COUNT(*)::text AS count
          FROM subscription_events e
          LEFT JOIN clinics cl ON cl.id = e.clinic_id
          WHERE cl.id IS NULL
        `,
      },
    ];

    const results: OrphanMetric[] = [];
    for (const check of checks) {
      const rows = await this.dataSource.query<CountRow[]>(check.sql);
      const value = count(rows[0]);
      results.push({
        name: check.name,
        count: value,
        severity: value > 0 ? 'warning' : 'ok',
      });
    }
    return results;
  }

  private async deletionBacklog(): Promise<
    DataReliabilityDiagnostics['deletionBacklog']
  > {
    const [row] = await this.dataSource.query<DeletionBacklogRow[]>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::text AS processing,
        COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
        MIN(created_at) FILTER (WHERE status IN ('pending', 'processing')) AS oldest_pending
      FROM gdpr_deletion_requests
    `);
    return {
      pending: Number(row?.pending ?? 0),
      processing: Number(row?.processing ?? 0),
      failed: Number(row?.failed ?? 0),
      oldestPendingCreatedAt: toIso(row?.oldest_pending),
    };
  }

  private risks(
    backup: BackupVisibility,
    tableGrowth: TableGrowthMetric[],
    orphanChecks: OrphanMetric[],
    deletionBacklog: DataReliabilityDiagnostics['deletionBacklog'],
  ): string[] {
    const risks: string[] = [];
    if (!backup.configured) {
      risks.push('backup_configuration_not_visible');
    }
    if (!backup.recoveryRunbookConfigured) {
      risks.push('recovery_runbook_not_configured');
    }
    if (!backup.lastRestoreDrillAt) {
      risks.push('restore_drill_not_recorded');
    }
    if (orphanChecks.some((check) => check.count > 0)) {
      risks.push('orphan_records_detected');
    }
    if (deletionBacklog.failed > 0) {
      risks.push('gdpr_deletion_failures_present');
    }
    if (deletionBacklog.pending + deletionBacklog.processing > 0) {
      risks.push('gdpr_deletion_backlog_present');
    }
    for (const table of tableGrowth) {
      if (table.totalBytes > 500 * 1024 * 1024) {
        risks.push(`large_table_${table.table}`);
      }
    }
    return risks;
  }
}
