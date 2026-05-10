import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config({ path: ['.env.local', '.env'] });

const DEFAULT_DEV_DATABASE_URL =
  'postgres://postgres:postgres@localhost:5432/heydoctor';

function resolveDatabaseUrl(): string {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return url;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required (TypeORM CLI / migrations)');
  }

  return DEFAULT_DEV_DATABASE_URL;
}

export default new DataSource({
  type: 'postgres',
  url: resolveDatabaseUrl(),
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false,
        }
      : false,
  synchronize: false,
  logging: false,
  entities: [__dirname + '/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
