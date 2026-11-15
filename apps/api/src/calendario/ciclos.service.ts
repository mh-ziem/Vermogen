import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { type Data, hoje } from './datas.js';
import {
  type Ciclo,
  type DatasReais,
  type IdCiclo,
  cicloDaData,
  descreverCiclo,
  ehIdCiclo,
  somarCiclos,
  validarDataReal,
} from './regras.js';

@Injectable()
export class CiclosService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
  ) {}

  async datasReais(): Promise<DatasReais> {
    const linhas: { id: string; data: string }[] = await this.db.query(
      `SELECT id, to_char(data_real_salario, 'YYYY-MM-DD') AS data FROM ciclo`,
    );
    return new Map(linhas.map((l) => [l.id, l.data]));
  }

  async atual(): Promise<Ciclo> {
    const reais = await this.datasReais();
    return descreverCiclo(cicloDaData(hoje(), reais), reais);
  }

  /** Ciclos de `de` até `ate`, inclusive (no máximo 36). */
  async listar(de: IdCiclo, ate: IdCiclo): Promise<Ciclo[]> {
    if (!ehIdCiclo(de) || !ehIdCiclo(ate) || de > ate) {
      throw new BadRequestException('Informe "de" e "ate" no formato AAAA-MM, com de ≤ ate');
    }
    const reais = await this.datasReais();
    const lista: Ciclo[] = [];
    for (let id = de; id <= ate; id = somarCiclos(id, 1)) {
      if (lista.length === 36) throw new BadRequestException('No máximo 36 ciclos por consulta');
      lista.push(descreverCiclo(id, reais));
    }
    return lista;
  }

  /** RN-04: a data real do salário substitui a calculada e redistribui os ciclos vizinhos. */
  async definirDataReal(autor: Autor, id: IdCiclo, data: Data): Promise<Ciclo> {
    if (!ehIdCiclo(id)) throw new NotFoundException('Ciclo não encontrado');
    const erro = validarDataReal(id, data, await this.datasReais());
    if (erro) throw new BadRequestException(erro);
    await this.escrita.executar(autor, (m) =>
      m.query(
        `INSERT INTO ciclo (id, data_real_salario) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data_real_salario = EXCLUDED.data_real_salario, atualizado_em = now()`,
        [id, data],
      ),
    );
    return descreverCiclo(id, await this.datasReais());
  }

  /** Volta a usar a data calculada (RN-01). */
  async removerDataReal(autor: Autor, id: IdCiclo): Promise<Ciclo> {
    if (!ehIdCiclo(id)) throw new NotFoundException('Ciclo não encontrado');
    await this.escrita.executar(autor, (m) => m.query(`DELETE FROM ciclo WHERE id = $1`, [id]));
    return descreverCiclo(id, await this.datasReais());
  }
}
