import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import { CONFIG, type Config } from '../config/config.js';

function resultado(dados: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(dados) }], structuredContent: dados };
}

/**
 * Ferramentas do MCP (DT-13). Cada ferramenta só traduz a chamada para um serviço do app;
 * as regras ficam nos módulos de origem (DT-06). Sem SQL livre.
 */
@Injectable()
export class ServidorMcp {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
  ) {}

  /** Um servidor por requisição: o transporte é sem estado (DT-12). */
  criar(): McpServer {
    const servidor = new McpServer({ name: 'vermogen', title: 'Vermögen', version: this.config.versao });

    servidor.registerTool(
      'ping',
      {
        title: 'Testar conexão',
        description: 'Confirma que a conexão com o Vermögen e o token funcionam. Devolve a versão do app.',
        annotations: { readOnlyHint: true },
      },
      async () => resultado({ status: 'ok', versao: this.config.versao }),
    );

    servidor.registerTool(
      'listar_contas',
      {
        title: 'Listar contas',
        description:
          'Lista as contas ativas com instituição, tipo (corrente, cartao, investimento, uso_restrito) e ' +
          'finalidade vigente hoje. Para cartões, traz os dias de fechamento e de vencimento e a próxima fatura.',
        annotations: { readOnlyHint: true },
      },
      async () => resultado({ contas: await this.cadastros.listarContas(false) }),
    );

    return servidor;
  }
}
