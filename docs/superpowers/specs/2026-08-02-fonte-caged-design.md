# Fonte automática CAGED (microdados PDET/MTE) — Design

**Data:** 2026-08-02
**Status:** aprovado pelo usuário (subprojeto 3 da fila de fontes; decisão de arquitetura: CAGED in-process agora, worker separado fica para RAIS/CNPJ)

## Objetivo

Fonte automática `caged` no pipeline de ingestão (`FONTES_AUTOMATICAS`): movimentações do Novo CAGED por município, alimentando as 13 tabelas `caged_*` existentes com a mesma lógica de agregação do loader manual (`ingestao/carregar_caged.py`). Zero migration, zero endpoint novo. Roda no container atual (in-process), mês a mês em disco — nunca o período inteiro em memória.

## Upstream (descoberto e validado em 2026-08-02)

FTP público `ftp.mtps.gov.br`, diretório `/pdet/microdados/NOVO CAGED/{ano}/{YYYYMM}/`:

- **`CAGEDMOV{YYYYMM}.7z`** (~50–60 MB comprimido): movimentações declaradas no prazo
- **`CAGEDFOR{YYYYMM}.7z`** (~1 MB): declaradas fora do prazo
- **`CAGEDEXC{YYYYMM}.7z`** (~0,1 MB): excluídas
- Cobertura: 2020-01 até o mês mais recente publicado (202606 em 2026-08)
- Interno: um `.txt` por 7z; UTF-8 com BOM, separador `;`, decimal com vírgula
- Colunas (validadas no CAGEDEXC202606): `competênciamov;região;uf;município;seção;subclasse;saldomovimentação;cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;sexo;tipoempregador;tipoestabelecimento;tipomovimentação;tipodedeficiência;indtrabintermitente;indtrabparcial;salário;tamestabjan;indicadoraprendiz;origemdainformação;competênciadec;indicadordeforadoprazo;unidadesaláriocódigo;valorsaláriofixo` (EXC tem ainda `competênciaexc;indicadordeexclusão`)
- `município` = código IBGE de **6 dígitos** (sem dígito verificador) → match por `codigo_ibge[:6]`
- **Armadilha validada:** linhas de FOR/EXC de um arquivo YYYYMM referem-se a competências (`competênciamov`) ANTERIORES — ex.: linhas de 202001 no EXC de 202606

Dependência nova: **`py7zr`** (1.1.x — API só extrai para disco: `extractall`; não há leitura em memória).

## Metodologia "com ajustes"

Saldo do mês M = MOV(M) + FOR com `competênciamov`=M − EXC com `competênciamov`=M.

- MOV e FOR entram com peso +1; **EXC entra com peso −1 no MESMO lado** indicado pelo `saldomovimentação` (admissão excluída decrementa admissões — não vira desligamento).
- Para janela [M1..Mk]: baixa MOV de cada mês da janela; baixa FOR+EXC de **todos** os meses de M1 até o mais recente publicado (são pequenos), filtrando linhas por `competênciamov` dentro da janela.
- FOR alimenta `total_fora_prazo` (via `indicadordeforadoprazo`).

## Processamento (mês a mês, em disco)

Para cada mês da janela: baixa o 7z via `ftplib` para arquivo temporário → `py7zr.extractall` para temp → streama o `.txt` linha a linha (`csv.reader`) agregando os 13 breakdowns → apaga os temps. Memória fica nos dicionários de agregados (pequenos). O ticker de heartbeat existente no runner cobre downloads longos; `progresso()` reporta por mês na fase de coleta ("competência 202506: baixando/agregando") e por município na gravação.

## Agregação (paridade com carregar_caged.py, mapas oficiais)

Mesmos 13 destinos e mesma estrutura de agregação do loader manual. Diferença deliberada: os mapas código→rótulo seguem o **layout oficial do Novo CAGED** (arquivo `Layout Não-identificado Novo Caged Movimentação.xlsx` no próprio FTP), porque os códigos divergem dos usados nos CSVs manuais:

- `sexo`: 1=Masculino, 3=Feminino, 9=Não informado (manual assumia 2=Feminino)
- `graudeinstrução`: 1–11 como no manual, + 80=Pós-graduação, 99=Não informado
- `tipomovimentação`: tabela completa do layout oficial (códigos 10–99; difere do mapa manual — ex.: 31=Sem Justa Causa no Novo CAGED). Fallback "Código N".
- Rótulos de saída idênticos aos existentes quando o conceito coincide (mesmas strings "Masculino", "Parda" etc. — séries não se fragmentam).
- Extração dos mapas do xlsx acontece na implementação (openpyxl já é dependência); os mapas ficam hardcoded no módulo como no loader manual.

`caged_por_cnae` usa `seção` (letra A–U) + `CNAE_SECAO_DESC` (reutilizado). Faixa etária pela função `_faixa_etaria` (reutilizada). Salário: média ponderada só de valores > 0, somas com sinal (EXC subtrai).

Código compartilhado com o loader manual (mapas/`_faixa_etaria`/`CNAE_SECAO_DESC`): o módulo novo importa do `ingestao/carregar_caged.py` o que for idêntico, sem duplicar — exceto os mapas que divergem (sexo/tipomovimentação/grau), que são próprios da fonte.

## Gravação

- **REPLACE por (município, mês)** — mesmo padrão do comex: delete + insert nas 12 tabelas mensais para os meses cuja coleta completou (MOV baixado com sucesso; FOR/EXC ausentes de um mês são tolerados com aviso, pois às vezes atrasam).
- Mês com falha de download do MOV é pulado inteiro, preservando dados existentes (aviso no resumo).
- `caged_indicadores_contrato` (anual) só é recomputado para anos **integralmente cobertos** pela janela processada com sucesso (todos os meses publicados do ano); ano parcial mantém o valor existente (aviso). Para o ano corrente, "integralmente" = de janeiro ao último mês publicado.
- Janela default: últimos 12 meses via `competencias_janela(inicio=(2020, 1))`; filtro `anos` do job cobre anos completos.
- Municípios sem movimentação no mês: zero linhas é dado, não erro (mesma regra do comex).

## Integração

- Módulo novo `backend/app/services/ingestao_automatica/caged_pdet.py`, `registrar(FonteAutomatica(key="caged", label="Emprego formal (Novo CAGED/MTE)", ...))` + import no `__init__.py`.
- `"caged"` em `ORDEM_EXECUCAO_TODAS` (entre as mensais, antes de captacao_federal/emendas; é a fonte mais pesada — posição logo antes das duas finais).
- `py7zr` em `requirements.txt`.
- `caged` já está nos DATASET_MODELS/LABELS do municipio_management (dataset antigo) — conferir na implementação.
- FTP sem TLS: falhas de rede viram erro técnico normal no resumo. Timeout generoso (o MOV de ~55 MB pode levar minutos).

## Testes e verificação

- TDD nos helpers puros (sem rede/DB) em `backend/tests/test_caged_pdet.py`: parse de linha (encoding, vírgula decimal, município 6 dígitos), agregação MOV+FOR−EXC (peso −1 no lado certo), filtro de competência na janela, regra do ano completo para indicadores, mapas oficiais (sexo 1/3/9).
- Suíte backend completa (exit 0).
- E2E: execução real pela tela admin com 1 município e ano corrente; conferência visual em /app/caged.

## Fora de escopo

- RAIS e Empresas/CNPJ (aguardam worker separado — próximo subprojeto de infra).
- Cancelamento de job, agendamento/cron.
- Recodificação dos meses legados carregados por CSV (o REPLACE natural das próximas janelas os substitui gradualmente; rodar a fonte com `anos` cobrindo o histórico faz a troca completa).
