/** Credenciales y marcadores para CI / `DATABASE_E2E=1`. Idempotentes por email+nombre clínica. */

export const E2E_CI_SEED_CLINIC_NAME = 'E2E CI Seed Clinic';

export const E2E_CI_ADMIN_EMAIL = 'e2e.ci.admin@heydoctor.local';

export const E2E_CI_DOCTOR_EMAIL = 'e2e.ci.doctor@heydoctor.local';

export const E2E_CI_PASSWORD = 'E2e_Ci_Seed_Pass_2026!';

/** Consultas listas para `create-payment-session` (estado compatible con Payku). */
export const E2E_CONSULT_MARKER_PAY = '__E2E_SEED_PAY__';

export const E2E_CONSULT_MARKER_FAIL = '__E2E_SEED_FAIL__';
