import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Rutas sin JWT (login, webhooks, health, etc.). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
