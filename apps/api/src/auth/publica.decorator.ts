import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'rota_publica';

/** Marca uma rota que responde sem credencial. Só as rotas listadas no SAD DT-11 podem usar. */
export const Publica = () => SetMetadata(ROTA_PUBLICA, true);
