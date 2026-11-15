/**
 * Limite de tentativas de login (SAD DT-11): 5 falhas em 15 minutos bloqueiam novas tentativas
 * até a falha mais antiga sair da janela. Fica em memória: o app tem um único usuário e um único processo.
 */
export class LimiteDeTentativas {
  private falhas: number[] = [];

  constructor(
    private readonly maximo = 5,
    private readonly janelaMs = 15 * 60 * 1000,
    private readonly agora: () => number = Date.now,
  ) {}

  private limpar(): void {
    const corte = this.agora() - this.janelaMs;
    this.falhas = this.falhas.filter((instante) => instante > corte);
  }

  bloqueado(): boolean {
    this.limpar();
    return this.falhas.length >= this.maximo;
  }

  /** Segundos até a próxima tentativa ser permitida (0 se não estiver bloqueado). */
  segundosDeEspera(): number {
    if (!this.bloqueado()) return 0;
    const maisAntiga = this.falhas[0] ?? this.agora();
    return Math.max(1, Math.ceil((maisAntiga + this.janelaMs - this.agora()) / 1000));
  }

  registrarFalha(): void {
    this.falhas.push(this.agora());
  }

  registrarSucesso(): void {
    this.falhas = [];
  }
}
