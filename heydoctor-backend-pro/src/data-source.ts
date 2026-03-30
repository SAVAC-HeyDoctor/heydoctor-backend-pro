import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';

config({ path: ['.env.local', '.env'] });

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL or DATABASE_PUBLIC_URL is required (TypeORM CLI / migrations)',
  );
}

const localDb =
  url.includes('localhost') ||
  url.includes('127.0.0.1') ||
  url.includes('@host.docker.internal');

export default new DataSource({
  type: 'postgres',
  url,
  ssl: localDb ? false : { rejectUnauthorized: false },
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: false,
});
