#!/usr/bin/env node
'use strict';

/**
 * Migration: Create default clinic and assign existing data.
 * Run: node scripts/migrateDefaultClinic.js
 * Requires: DATABASE_* env vars (or .env)
 */
try { require('dotenv').config(); } catch (_) {}
const { Client } = require('pg');

const DEFAULT_CLINIC = {
  name: 'HeyDoctor Default Clinic',
  slug: 'default-clinic',
};

async function migrate() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  if (!process.env.DATABASE_NAME) {
    console.error('DATABASE_NAME required. Set env vars or use .env');
    process.exit(1);
  }

  try {
    await client.connect();
    console.log('Connected to database');

    let clinicRes = await client.query(
      'SELECT id FROM clinics WHERE slug = $1',
      [DEFAULT_CLINIC.slug]
    );
    if (clinicRes.rows.length === 0) {
      clinicRes = await client.query(
        `INSERT INTO clinics (name, slug, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [DEFAULT_CLINIC.name, DEFAULT_CLINIC.slug]
      );
    }

    const clinicId = clinicRes.rows[0]?.id;
    if (!clinicId) {
      console.error('Could not find or create default clinic');
      process.exit(1);
    }
    console.log('Using default clinic:', clinicId);

    const users = await client.query('SELECT id FROM up_users');
    for (const u of users.rows) {
      const exists = await client.query(
        'SELECT 1 FROM clinic_users WHERE clinic_id = $1 AND user_id = $2',
        [clinicId, u.id]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO clinic_users (clinic_id, user_id, role, created_at, updated_at)
           VALUES ($1, $2, 'doctor', NOW(), NOW())`,
          [clinicId, u.id]
        );
      }
    }
    console.log('Assigned', users.rows.length, 'users to default clinic as doctors');

    const tables = [
      { table: 'patients', col: 'clinic_id' },
      { table: 'appointments', col: 'clinic_id' },
      { table: 'clinical_records', col: 'clinic_id' },
      { table: 'clinical_documents', col: 'clinic_id' },
      { table: 'telemedicine_consents', col: 'clinic_id' },
      { table: 'diagnostics', col: 'clinic_id' },
      { table: 'videocalls', col: 'clinic_id' },
      { table: 'payments', col: 'clinic_id' },
      { table: 'audit_logs', col: 'clinic_id' },
    ];

    for (const { table, col } of tables) {
      try {
        const res = await client.query(
          `UPDATE ${table} SET ${col} = $1 WHERE ${col} IS NULL`,
          [clinicId]
        );
        if (res.rowCount > 0) console.log(`Updated ${table}: ${res.rowCount} rows`);
      } catch (err) {
        if (err.code === '42P01') console.log(`Table ${table} does not exist, skipping`);
        else if (err.message?.includes('column') && err.message?.includes('does not exist')) {
          console.log(`Column ${col} does not exist in ${table}, skipping`);
        } else throw err;
      }
    }

    console.log('Migration complete');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
