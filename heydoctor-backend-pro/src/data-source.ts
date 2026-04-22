import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildTypeOrmSslConfig } from './config/typeorm-ssl';

config({ path: ['.env.local', '.env'] });

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL or DATABASE_PUBLIC_URL is required (TypeORM CLI / migrations)',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  ssl: buildTypeOrmSslConfig(url),
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: false,
});
