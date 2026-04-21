import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como público.
 * El JwtAuthGuard omite la validación del token en estos endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
