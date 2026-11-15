/** Erro de uma chamada à API, com o código HTTP e a mensagem devolvida pelo servidor. */
export class ErroDeApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly esperaSegundos?: number,
  ) {
    super(mensagem)
  }
}

/** Chama a API na mesma origem da tela; o cookie de sessão vai junto automaticamente. */
export async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch {
    throw new ErroDeApi(0, 'Sem conexão com o servidor')
  }
  if (resposta.status === 204) return undefined as T
  const dados: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const mensagem = (dados as { message?: unknown } | null)?.message
    const espera = Number(resposta.headers.get('Retry-After')) || undefined
    throw new ErroDeApi(
      resposta.status,
      typeof mensagem === 'string' ? mensagem : `Erro ${resposta.status}`,
      espera,
    )
  }
  return dados as T
}
