import 'dotenv/config';
import { DataSource } from 'typeorm';

const databaseUrl =
  process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  host: databaseUrl ? undefined : process.env.DB_HOST || 'localhost',
  port: databaseUrl ? undefined : parseInt(process.env.DB_PORT || '5432', 10),
  username: databaseUrl ? undefined : process.env.DB_USERNAME || 'postgres',
  password: databaseUrl ? undefined : process.env.DB_PASSWORD || 'postgres',
  database: databaseUrl ? undefined : process.env.DB_DATABASE || 'nest_backend',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
