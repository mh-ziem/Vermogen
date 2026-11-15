import { TokensService } from '../src/mcp/tokens.service.js';
import { type Contexto, reiniciarDados, subirApp } from './apoio.js';

describe('tokens do MCP: revogação', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('revogar só confirma quando o token existe e ainda não foi revogado', async () => {
    const tokens = ctx.app.get(TokensService);
    const { id } = await tokens.criar('teste');
    expect(await tokens.revogar('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(await tokens.revogar(id)).toBe(true);
    expect(await tokens.revogar(id)).toBe(false);
  });
});
