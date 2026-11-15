import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import { ClassificacaoService } from '../classificacao/classificacao.service.js';
import { PendenciasService } from '../classificacao/pendencias.service.js';
import { validar } from '../comum/erros.js';
import { CONFIG, type Config } from '../config/config.js';
import { ImportacaoService } from '../importacao/importacao.service.js';
import { NATUREZAS, filtro, lancamento, lote, novaCategoria, resolucao } from '../transacoes/esquemas.js';
import { TransacoesService } from '../transacoes/transacoes.service.js';

function resultado(dados: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(dados) }],
    structuredContent: dados as Record<string, unknown>,
  };
}

/** Toda escrita pelo MCP é do Claude (DT-13 regra 2). */
const CLAUDE = 'claude' as const;

const dataTexto = z.string().describe('Data no formato AAAA-MM-DD');
const dinheiro = z
  .union([z.number(), z.string()])
  .describe('Valor em reais com até 2 casas, ponto como separador decimal (ex.: -47.9 ou "-47.90")');
const TIPOS_DE_ITEM = z
  .enum(['receita', 'despesa', 'transferencia', 'pagamento_fatura'])
  .describe('Opcional. Sem tipo, as regras decidem; sem regra, positivo = receita e negativo = despesa');

/**
 * Ferramentas do MCP (DT-13). Cada ferramenta só traduz a chamada para um serviço do app;
 * as regras ficam nos módulos de origem (DT-06). Sem SQL livre e sem alterar valor ou data.
 */
@Injectable()
export class ServidorMcp {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
    @Inject(ClassificacaoService) private readonly classificacao: ClassificacaoService,
    @Inject(TransacoesService) private readonly transacoes: TransacoesService,
    @Inject(ImportacaoService) private readonly importacao: ImportacaoService,
    @Inject(PendenciasService) private readonly pendencias: PendenciasService,
  ) {}

  /** Um servidor por requisição: o transporte é sem estado (DT-12). */
  criar(): McpServer {
    const s = new McpServer(
      { name: 'vermogen', title: 'Vermögen', version: this.config.versao },
      {
        instructions:
          'Vermögen é o projetor de caixa pessoal do Matheus. Valores seguem o sinal do dinheiro: positivo entra, ' +
          'negativo sai. Para lançar um extrato ou fatura, use importar_lote (um documento = um lote, com o total ' +
          'que o documento declara). Não é possível alterar valor ou data de transação já gravada: erro de leitura ' +
          'se corrige com desfazer_lote e nova importação. Toda alteração fica registrada como feita pelo Claude.',
      },
    );
    const leitura = { readOnlyHint: true };

    s.registerTool(
      'ping',
      {
        title: 'Testar conexão',
        description: 'Confirma que a conexão com o Vermögen e o token funcionam. Devolve a versão do app.',
        annotations: leitura,
      },
      async () => resultado({ status: 'ok', versao: this.config.versao }),
    );

    s.registerTool(
      'listar_contas',
      {
        title: 'Listar contas',
        description:
          'Lista as contas ativas com id, instituição, tipo (corrente, cartao, investimento, uso_restrito) e finalidade ' +
          'vigente hoje. Para cartões, traz os dias de fechamento e de vencimento e a próxima fatura. Use o id em importar_lote.',
        annotations: leitura,
      },
      async () => resultado({ contas: await this.cadastros.listarContas(false) }),
    );

    s.registerTool(
      'listar_categorias',
      {
        title: 'Listar categorias',
        description:
          'Lista as categorias ativas (id, nome, paiId da categoria de primeiro nível, natureza: intermitente, ' +
          'parcelada, pontual ou flexivel) e as regras de categorização ativas.',
        annotations: leitura,
      },
      async () =>
        resultado({
          categorias: await this.classificacao.listarCategorias(false),
          regras: (await this.classificacao.listarRegras()).filter((r) => r.ativa),
        }),
    );

    s.registerTool(
      'criar_categoria',
      {
        title: 'Criar categoria',
        description:
          'Cria uma categoria (SAD PD-3). A árvore tem dois níveis: sem paiId, categoria de primeiro nível; com paiId ' +
          '(id de uma categoria de primeiro nível), subcategoria. O nome é único em cada nível (sem diferenciar ' +
          'maiúsculas): consulte listar_categorias antes para não repetir. natureza é opcional: intermitente, ' +
          'parcelada, pontual ou flexivel. Fica registrado como feito pelo Claude; o Matheus desativa pela tela se preciso.',
        inputSchema: {
          nome: z.string().describe('Até 60 caracteres'),
          paiId: z.string().optional().describe('id da categoria de primeiro nível'),
          natureza: z.enum(NATUREZAS).optional(),
        },
      },
      async (args) => {
        const limpo = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        return resultado({ categoria: await this.classificacao.criarCategoria(CLAUDE, validar(novaCategoria, limpo)) });
      },
    );

    s.registerTool(
      'listar_lotes',
      {
        title: 'Listar lotes',
        description: 'Lista os lotes importados (mais recentes primeiro), com status aceito, nao_conferido ou desfeito.',
        inputSchema: {
          contaId: z.string().optional().describe('Filtra por conta'),
          ciclo: z.string().optional().describe('Ciclo AAAA-MM: lotes cujo período cruza o ciclo'),
          status: z.enum(['aceito', 'nao_conferido', 'desfeito']).optional(),
        },
        annotations: leitura,
      },
      async (args) => resultado({ lotes: await this.importacao.listar(args) }),
    );

    s.registerTool(
      'consultar_transacoes',
      {
        title: 'Consultar transações',
        description:
          'Busca transações (não excluídas) com filtros e paginação. Devolve também o total encontrado e a soma. ' +
          'O ciclo é o da data de pagamento (no cartão, o vencimento da fatura).',
        inputSchema: {
          ciclo: z.string().optional().describe('Ciclo AAAA-MM'),
          contaId: z.string().optional(),
          categoriaId: z.string().optional().describe('Inclui as subcategorias'),
          loteId: z.string().optional(),
          semCategoria: z.boolean().optional(),
          texto: z.string().optional().describe('Trecho da descrição'),
          limite: z.number().int().optional().describe('Padrão 100, máximo 500'),
          pagina: z.number().int().optional(),
        },
        annotations: leitura,
      },
      async (args) => {
        const comoTexto = Object.fromEntries(
          Object.entries(args)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        );
        return resultado(await this.transacoes.consultar(validar(filtro, comoTexto)));
      },
    );

    s.registerTool(
      'listar_pendencias',
      {
        title: 'Listar pendências',
        description:
          'Lista o que precisa de revisão (UC-03): transações sem categoria, possíveis duplicatas (com a transação ' +
          'original) e lotes não conferidos. Resolva cada uma com resolver_pendencia.',
        annotations: leitura,
      },
      async () => resultado(await this.pendencias.listar()),
    );

    s.registerTool(
      'importar_lote',
      {
        title: 'Importar lote',
        description:
          'Importa as transações de UM documento (extrato, fatura, CSV, print) como um lote. Regras:\n' +
          '- Sinal: positivo entra na conta, negativo sai. Numa fatura de cartão, compras são negativas e estornos positivos.\n' +
          '- totalDeclarado: o total que o próprio documento informa, com o mesmo sinal da soma dos itens ' +
          '(fatura de R$ 1.146,00 em compras → -1146.00). O lote só é aceito se a soma bater ao centavo.\n' +
          '- Sem total no documento, envie saldoInicial e saldoFinal (saldo inicial + itens = saldo final).\n' +
          '- Sem nenhum dos dois, o lote entra como "não conferido" e vai para as pendências.\n' +
          '- Cartão: envie fatura {fechamento, vencimento} do documento; todas as compras, inclusive parcelas ' +
          'antigas ("parcela 2/4"), entram nessa fatura. Sem fatura, cada item vai para a fatura calculada pela sua data.\n' +
          '- Outras contas: as datas dos itens precisam estar dentro do período.\n' +
          '- Reenviar o mesmo lote não duplica nada (status "repetido"). Itens iguais a transações já gravadas ' +
          'entram marcados como possível duplicata, nunca descartados.\n' +
          '- Se a soma não bater, nada é gravado: releia o documento e reenvie. Máximo de 500 itens.',
        inputSchema: {
          contaId: z.string().describe('id da conta (listar_contas)'),
          documento: z.string().describe('Identificação do documento, ex.: "Fatura Nubank venc. 09/11/2026"'),
          periodo: z.object({ de: dataTexto, ate: dataTexto }).describe('Período coberto pelo documento'),
          fatura: z.object({ fechamento: dataTexto, vencimento: dataTexto }).optional().describe('Só para cartão'),
          totalDeclarado: dinheiro.optional(),
          saldoInicial: dinheiro.optional(),
          saldoFinal: dinheiro.optional(),
          itens: z
            .array(
              z.object({
                data: dataTexto.describe('Data da compra ou do movimento'),
                descricao: z.string().describe('Descrição como está no documento'),
                valor: dinheiro,
                parcela: z
                  .object({ numero: z.number().int(), total: z.number().int() })
                  .optional()
                  .describe('Ex.: parcela 2 de 4 → {numero: 2, total: 4}'),
                categoriaId: z.string().optional().describe('Opcional (listar_categorias); sem ela, as regras decidem'),
                tipo: TIPOS_DE_ITEM.optional(),
              }),
            )
            .describe('Transações do documento'),
        },
      },
      async (args) => resultado(await this.importacao.importar(CLAUDE, 'claude', validar(lote, args))),
    );

    s.registerTool(
      'desfazer_lote',
      {
        title: 'Desfazer lote',
        description:
          'Desfaz um lote inteiro: as transações dele vão para a lixeira e o mesmo documento pode ser importado de novo. ' +
          'É a forma de corrigir erro de leitura.',
        inputSchema: { loteId: z.string() },
        annotations: { destructiveHint: true },
      },
      async ({ loteId }) => resultado(await this.importacao.desfazer(CLAUDE, validar(z.uuid(), loteId))),
    );

    s.registerTool(
      'resolver_pendencia',
      {
        title: 'Resolver pendência',
        description:
          'Resolve uma pendência. tipo "categorizar": define a categoria (criarRegra.padrao cria uma regra para as ' +
          'próximas). tipo "duplicata": decisao "manter" (não é duplicata) ou "excluir" (vai para a lixeira). ' +
          'tipo "lote": decisao "aceitar" ou "descartar" um lote não conferido. Tudo fica registrado como feito pelo Claude.',
        inputSchema: {
          tipo: z.enum(['categorizar', 'duplicata', 'lote']),
          transacaoId: z.string().optional().describe('Para categorizar e duplicata'),
          categoriaId: z.string().optional().describe('Para categorizar'),
          criarRegra: z.object({ padrao: z.string() }).optional().describe('Para categorizar'),
          loteId: z.string().optional().describe('Para lote'),
          decisao: z.enum(['manter', 'excluir', 'aceitar', 'descartar']).optional(),
        },
      },
      async (args) => {
        const limpo = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        return resultado(await this.pendencias.resolver(CLAUDE, validar(resolucao, limpo)));
      },
    );

    s.registerTool(
      'registrar_lancamento',
      {
        title: 'Registrar lançamento',
        description:
          'Registra uma transação avulsa, fora de documento (UC-09). Para a "receita fora das contas" (ex.: a metade da ' +
          'faculdade paga pela mãe, D3), use tipo "receita_fora_das_contas", sem contaId, valor positivo e, se houver, ' +
          'compensaId com o id da transação que ela compensa. Para lançar vários itens de um documento, prefira importar_lote.',
        inputSchema: {
          contaId: z.string().optional().describe('Obrigatório, exceto em receita fora das contas'),
          data: dataTexto,
          descricao: z.string(),
          valor: dinheiro,
          tipo: z.enum(['receita', 'despesa', 'transferencia', 'pagamento_fatura', 'receita_fora_das_contas']).optional(),
          categoriaId: z.string().optional(),
          compensaId: z.string().optional(),
        },
      },
      async (args) => {
        const limpo = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        return resultado(await this.transacoes.lancar(CLAUDE, validar(lancamento, limpo)));
      },
    );

    return s;
  }
}
