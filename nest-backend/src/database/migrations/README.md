# TypeORM Migrations

## Patient Entity Migration

**File:** `1732060800000-PatientEntityMigration.ts`

### Changes (up)
- Renames `firstName` → `firstname`
- Renames `documentNumber` → `identification`
- Renames `lastName` → `lastname`
- Renames `dateOfBirth` → `birth_date`
- Adds columns: `identification_type`, `city`, `province`, `uid`, `profile_picture`
- Creates join table `patient_favorite_doctors`
- Adds unique index on `identification`

### Run migration
```bash
npm run migration:run
```

### Revert migration
```bash
npm run migration:revert
```

### Requirements
- `DATABASE_URL` or `DATABASE_PRIVATE_URL` must be set (or DB_* env vars)
- Existing data is preserved (column renames only)
