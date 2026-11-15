import { Inicial1794657600000 } from './1794657600000-inicial.js';
import { Cadastros1794697200000 } from './1794697200000-cadastros.js';
import { Transacoes1794744000000 } from './1794744000000-transacoes.js';

/** Lista explícita, na ordem de aplicação. Toda migração nova entra aqui. */
export const migrations = [Inicial1794657600000, Cadastros1794697200000, Transacoes1794744000000];
