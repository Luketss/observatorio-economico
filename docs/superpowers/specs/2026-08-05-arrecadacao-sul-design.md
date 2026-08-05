# Arrecadação estadual — conectores PR e RS (roteador por UF) — Design

**Data:** 2026-08-05
**Escopo:** backend apenas (refactor da fonte `arrecadacao` em roteador + 2 conectores;
zero frontend, zero migração)
**Contexto:** a fonte `arrecadacao` é MG-only (`arrecadacao_mg.py`, CKAN dados.mg.gov.br;
alvos de outra UF geram aviso único). Expansão para o Sul, começando pelos 2 estados com
fonte viável. Tabela destino: `arrecadacao_mensal` (unique `municipio_id, ano, mes`;
colunas fixas `nome_mes`, `data_base`, `valor_icms`, `valor_ipva`, `valor_ipi`,
`valor_total` — todas NOT NULL, sem coluna "outros").

**Fatos verificados por HTTP real em 2026-08-05 (sondagens com amostras salvas):**

- **PR (SEFA, sistema JSP legado `www4.pr.gov.br/Gestao/portaldatransparencia/repasses/`):**
  endpoint GET SEM auth/sessão `relatorio/rrepassesmun.jsp?Param_Data=01/MM/AAAA&
  Param_Tiporelatorio=MENSAL` (ANUAL/SEMANAL/DIARIA também existem; anos < 2003 usam a
  variante `rrepassesmun_lk.jsp`). HTML **windows-1252**, número BR, ~399 municípios por
  requisição, série 1999→hoje (quase real-time). Colunas: Município (SÓ NOME, sem IBGE),
  Índice, ICMS Bruto, ICMS Líquido, Fundo de Exportação, Royalties Petróleo, IPVA,
  Total Repasse Líquido.
- **RS (Sefaz-RS, ASP.NET legado, ativo até 2026):** download direto
  `https://www.sefaz.rs.gov.br/Site/MontaArquivo.aspx?al=l_icms_rep_YYYYMM` (ICMS) e
  `al=l_ipva_rep_YYYYMM` (IPVA); 2005/2006 têm arquivo anual único (`l_icms_rep_2005`).
  Série ICMS 2005→2026, IPVA 2006→2025+, mensal. Arquivo `.xls` legado (~165KB; se BIFF
  real exige `xlrd` — dependência nova aceitável e sinalizada; se for tabela HTML
  disfarçada, parse stdlib — **verificação obrigatória cedo no plano com a amostra já
  baixada**). Município SÓ POR NOME (maiúsculo sem acento), colunas por semana de
  repasse + totais do mês. **RS não publica IPI-Exportação** em fonte dedicada.
- **SC: FORA deste ciclo** (CSVs oficiais param em dez/2017; dados correntes em portal
  do Banco do Brasil sem API; FECAM só com scraping página-a-página). Registrar no
  IDEAS.md a via LAI à SEF/SC (o formato CSV existiu até 2017 — "relatório 64" do SAT).

## Decisões (validadas com o usuário)

1. **PR + RS agora; SC fora** (documentado como bloqueado-por-fonte).
2. **Fonte única com roteador por UF**: um card só na tela, mesma key `arrecadacao`,
   mesma posição no meta-job "todas"; conectores por módulo; UF sem conector = aviso
   único audível (generaliza o comportamento atual).
3. Mesma tabela e upsert-com-update por (município, ano, mês) — Estados corrigem
   retroativamente.

## 1. Roteador (`arrecadacao.py` novo assume o registro)

- `arrecadacao_mg.py` deixa de chamar `registrar(...)` e exporta seu executar como
  `executar_mg` (código do conector INTACTO).
- Novo `arrecadacao.py`: agrupa `municipios` por UF; despacha MG→`executar_mg`,
  PR→`executar_pr`, RS→`executar_rs`; UFs sem conector → 1 aviso agregado em
  `resumo.erros` ("arrecadação: sem conector para UF X — N municípios ignorados");
  mescla os `ResumoIngestao` parciais (somas + erros concatenados com prefixo da UF);
  falha de um conector não derruba os outros (isolamento por UF, erro audível).
  Registro: mesma key/label/fonte atual (label pode ganhar "MG/PR/RS" — plano decide o
  texto exato); progresso reparte as etapas por UF.
- `ORDEM_EXECUCAO_TODAS`/`FONTES_FORA_DO_TODAS` inalterados (arrecadacao continua no
  "todas").

## 2. Conector PR (`arrecadacao_pr.py`)

- Por mês-alvo: GET MENSAL (`Param_Data=01/MM/AAAA&Param_Tiporelatorio=MENSAL`),
  decode windows-1252, parse da tabela HTML (stdlib `html.parser` — sem dependência
  nova), número BR → float.
- Guarda "layout mudou?": valida os headers esperados da tabela; divergência → erro
  audível hard-stop (nenhuma linha gravada do mês).
- Match: nome do município + "PR" via `norm_nome_municipio` contra os alvos; nome que
  não casa → contado e agregado audível.
- Mapeamento: `valor_icms` = ICMS **Líquido**; `valor_ipi` = Fundo de Exportação;
  `valor_ipva` = IPVA; `valor_total` = soma dos 3 (consistente com as partes).
  **Royalties Petróleo FICA FORA** (não há coluna; decisão explícita e documentada no
  módulo — total ≠ "Total Repasse Líquido" da página quando houver royalties, e o
  docstring explica isso).
- `anos`/default: mesma janela default do conector MG (paridade de comportamento; o
  plano transcreve a regra atual do MG).

## 3. Conector RS (`arrecadacao_rs.py`)

- Por mês-alvo: baixa os DOIS arquivos (`l_icms_rep_YYYYMM`, `l_ipva_rep_YYYYMM`);
  parse conforme o formato real da amostra (decisão BIFF/xlrd vs HTML/stdlib no início
  do plano); junta por município (nome normalizado).
- `valor_icms` = total ICMS líquido do mês; `valor_ipva` = total IPVA do mês;
  `valor_ipi` = **0.0** (RS não publica IPI-Exp — documentado no docstring e no
  registro da fonte); `valor_total` = ICMS + IPVA.
- Mês com só um dos arquivos publicado (ICMS costuma sair antes do IPVA): o mês SÓ
  entra quando os DOIS arquivos respondem 200 com layout válido — gravar meio-mês
  criaria um registro incompleto que uma rodada futura corrigiria silenciosamente.
  Senão: aviso "mês X: aguardando publicação completa" e o mês fica de fora (a rodada
  futura completa via upsert).
- 404/arquivo inexistente do mês corrente = não-publicado (aviso informativo, padrão
  das fontes); guarda de layout como no PR.

## 4. Gravação (comum, no roteador ou por conector — plano decide)

Upsert-com-UPDATE por `(municipio_id, ano, mes)` (paridade com MG: Estado corrige o
fato retroativamente; `on_conflict_do_update`), `nome_mes`/`data_base` no padrão do MG.
Commit por município ou por UF (plano segue o idioma do conector MG).

## Casos de borda

- Alvo de UF sem conector (SC, SP…): aviso único agregado por UF; municípios contados
  em `municipios_erro`.
- Nome que não casa com alvo (grafia divergente): contado, aviso agregado, nunca
  silencioso.
- Fonte fora do ar (JSP/ASP legados sem SLA): retry 1x (padrão HTTP das fontes),
  falha vira erro audível da UF sem derrubar as outras.
- Execução mista (alvos MG+PR+RS numa seleção): três conectores rodam em sequência,
  resumo mesclado.

## Testes e gates

- **TDD dos parsers** com fixtures mínimos derivados das amostras REAIS salvas nas
  sondagens (HTML PR, .xls RS — reduzidos a 3-5 municípios; fixtures pequenos no repo
  de testes): parse/número BR/charset, guarda de layout, match por nome, mapeamento de
  tributos (royalties fora no PR; ipi=0 no RS), mês incompleto RS não grava.
- **Testes do roteador**: agrupamento por UF, aviso de UF sem conector, mescla de
  resumos, isolamento de falha por UF.
- Gate: `venv/Scripts/python -m pytest backend/tests -q` exit 0 (273 + novos).
- **E2E real na verificação final**: municípios de teste PR e RS SINTÉTICOS criados no
  banco de dev (não há clientes dessas UFs), coleta real de 1-2 meses via conectores,
  contagens em `arrecadacao_mensal`, re-run de upsert idempotente, cleanup dos
  sintéticos.

## Fora de escopo

- SC (LAI anotada no IDEAS); demais UFs; royalties como métrica própria (exigiria
  migração); backfill histórico completo além do default; VAF (outra fonte estadual,
  ciclo próprio); frontend (a página de Arrecadação já lê `arrecadacao_mensal`).
