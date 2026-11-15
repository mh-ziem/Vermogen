import type { CadastrosService } from './cadastros.service.js';
import type { Finalidade, TipoDeConta } from './esquemas.js';

/**
 * Configuração inicial do PRD §9.4 (tudo editável depois). Cores dos protótipos (DS-06).
 * Os dias dos cartões são os do PRD §9.2 (RN-08).
 */
export const CONFIGURACAO_INICIAL: {
  nome: string;
  cor: string;
  contas: { nome: string; tipo: TipoDeConta; finalidade: Finalidade; dias?: [number, number] }[];
}[] = [
  { nome: 'Itaú', cor: '#EC7000', contas: [{ nome: 'Conta corrente', tipo: 'corrente', finalidade: 'recebimento' }] },
  { nome: 'Nubank', cor: '#8A05BE', contas: [{ nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', dias: [1, 9] }] },
  {
    nome: 'Inter',
    cor: '#FF9A3D',
    contas: [
      { nome: 'Conta corrente', tipo: 'corrente', finalidade: 'gasto' },
      { nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', dias: [31, 7] },
      { nome: 'CDB', tipo: 'investimento', finalidade: 'investimento' },
    ],
  },
  {
    nome: 'Mercado Pago',
    cor: '#00B1EA',
    contas: [
      { nome: 'Reserva', tipo: 'investimento', finalidade: 'reserva' },
      { nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', dias: [29, 4] },
    ],
  },
  {
    nome: 'Flash',
    cor: '#FF3D8B',
    contas: [
      { nome: 'Alimentação', tipo: 'uso_restrito', finalidade: 'gasto' },
      { nome: 'Premiação', tipo: 'uso_restrito', finalidade: 'gasto' },
    ],
  },
];

/** Cadastra a configuração inicial. Só roda com o cadastro vazio, para não duplicar nada. */
export async function cadastrarConfiguracaoInicial(cadastros: CadastrosService): Promise<number> {
  if ((await cadastros.listarInstituicoes(true)).length > 0) {
    throw new Error('Já existem instituições cadastradas; a configuração inicial só roda com o cadastro vazio');
  }
  let contas = 0;
  for (const inst of CONFIGURACAO_INICIAL) {
    const { id } = await cadastros.criarInstituicao('matheus', { nome: inst.nome, cor: inst.cor });
    for (const c of inst.contas) {
      await cadastros.criarConta('matheus', {
        instituicaoId: id,
        nome: c.nome,
        tipo: c.tipo,
        finalidade: c.finalidade,
        ...(c.dias ? { diaFechamento: c.dias[0], diaVencimento: c.dias[1] } : {}),
      });
      contas++;
    }
  }
  return contas;
}
