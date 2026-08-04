# Fonte automática Empresas/CNPJ (Ciclo C da frente RAIS/CNPJ) — Design

**Data:** 2026-08-04
**Escopo:** backend apenas (1 fonte nova + testes; zero frontend, zero migração)
**Contexto:** 3º e último ciclo da frente de fontes pesadas (A worker ✅ → B RAIS ✅ →
**C CNPJ**). Worker rodando em produção. Hoje a tabela `empresas` só entra por CSV
manual pré-filtrado FORA do repo (`carregar_cnpj.py` estágio 2) — esta fonte elimina o
pré-processamento externo, filtrando os arquivos nacionais dentro do pipeline.

**Fatos verificados no share em 2026-08-03/04** (Nextcloud SERPRO, WebDAV público,
share `YggdBLfdninEJX9` em `arquivos.receitafederal.gov.br` — a URL antiga morreu em
jan/2026):

- Mensal, histórico 2023-05 → **2026-07**; cada mês tem 37 zips ≈ **7,6GB comprimidos**:
  `Estabelecimentos0-9` (~5,3GB; o 0 tem 2,1GB), `Empresas0-9` (~1,4GB), `Simples.zip`
  (300MB), `Socios0-9` (~0,7GB — NÃO usado) + auxiliares minúsculas (`Municipios.zip`,
  `Cnaes.zip` etc.).
- Auxiliares validadas por download real: CSV `;` com aspas, **latin-1**, sem header,
  nome interno estilo `F.K03200$Z.D60711.MUNICCSV`. `Municipios.zip` = **código TOM de
  4 dígitos → NOME, SEM UF** (`"4123";"BELO HORIZONTE"`, 5.572 linhas) — o código de
  município da RFB NÃO é IBGE.
- Layouts dos arquivos grandes: posições oficiais dos metadados da RFB (transcritas no
  plano; Estabelecimentos 30 colunas, Empresas 7, Simples 7) — validadas em runtime por
  guarda de contagem de colunas e na 1ª leitura real do E2E.

## Decisões (validadas com o usuário)

1. **Fora do meta-job "todas"** (`FONTES_FORA_DO_TODAS` ganha `"cnpj"`): a fonte mais
   pesada da esteira — ~7,6GB por execução para QUALQUER seleção (arquivos nacionais,
   varredura completa) — sob demanda, no worker.
2. **Snapshot mensal**: sempre o mês mais recente do share; `anos` aceito e ignorado
   (documentado no módulo, padrão do `notificar` da RAIS).
3. **REPLACE por município** na tabela `empresas` (situação cadastral muda; a página
   deriva "fechadas" de `situacao != "02"` — upsert-que-não-atualiza mentiria).
   Substitui dados do CSV manual do município (o manual segue como fallback,
   `do_nothing`). Proteção anti-wipe igual à RAIS.
4. **Sócios fora de escopo** (o model `Empresa` não usa).
5. Regra transversal "nenhum descarte silencioso" + guarda "layout mudou?" (por
   contagem de colunas — os arquivos não têm header).

## 1. Fonte `cnpj_rfb.py` (`app/services/ingestao_automatica/`)

- Registry: `key="cnpj"`, label "Empresas (CNPJ/RFB)", fonte "RFB — Cadastro Nacional
  da Pessoa Jurídica, dados abertos mensais". Import no `__init__.py`; `"cnpj"` entra em
  `FONTES_FORA_DO_TODAS` (base.py).
- Assinatura padrão do registry; `notificar` e `anos` aceitos e ignorados.
- Transporte: HTTP com `requests` streaming (chunks) contra o WebDAV público
  (`GET https://arquivos.receitafederal.gov.br/public.php/webdav/<mes>/<arquivo>`,
  auth `(share_token, "")`); listagem de meses via `PROPFIND` Depth 1. Retry: 1
  re-tentativa por arquivo em falha transitória (padrão `baixar_tolerante` adaptado a
  HTTP); falha dupla = erro audível por arquivo no resumo.

## 2. Download e parse — um zip por vez, sem extração

Para cada zip (ordem: `Municipios.zip` → `Estabelecimentos0-9` → `Empresas0-9` →
`Simples.zip`): baixa para `TemporaryDirectory` (pior caso ~2,2GB em disco), abre com
`zipfile.ZipFile(...).open(nome_interno)` e parseia EM STREAMING de dentro do zip
(`io.TextIOWrapper(..., encoding="latin-1")` + `csv.reader(delimiter=";", quotechar='"')`)
— sem extrair, sem materializar o CSV. Zip é removido antes do próximo download.
Progresso por etapas ("baixando Estabelecimentos3 (4/21)", "processando …"); o ticker
de heartbeat do runner cobre os downloads longos.

## 3. Duas passadas + match de município

- **Mapa TOM**: `Municipios.zip` → dict TOM→nome; municípios-alvo indexados por
  `(norm_nome_municipio(nome), uf)` (helper existente em `util.py`, padrão FPM).
- **Passada 1 — Estabelecimentos (10 zips)**: linha casa quando
  `(norm_nome_municipio(nome_do_TOM), UF_da_linha)` ∈ alvos. Colhe por
  `(municipio_id, cnpj_basico)`: `nome_fantasia`, `situacao` (código cru, ex. "02"),
  `data_inicio`, `cnae_fiscal`, com **matriz preferida** (`matriz_filial == "1"`
  substitui registro de filial; entre iguais, o primeiro visto fica) — paridade com a
  unicidade `(municipio_id, cnpj_basico)` do model.
- **Passada 2 — Empresas (10 zips) + Simples (1 zip)**: nacionais, sem município;
  filtram pelo set de `cnpj_basico` colhidos (memória ~dezenas de MB para uma capital)
  e completam `razao_social`, `porte` (código cru), `capital_social` (decimal com
  VÍRGULA → float), `opcao_simples`/`opcao_mei` ("S"/"N").
- Campos ausentes (empresa sem linha no Simples etc.): ficam None/"N" conforme o
  default do model — contado em nada (é o normal do cadastro), sem erro.
- TOM sem entrada no mapa de municípios da RFB: contado e agregado em 1 item audível
  no resumo (nunca silencioso).

## 4. Gravação — REPLACE por município

Por município-alvo: `delete()` de `empresas` para o `municipio_id` + inserts do
snapshot + `commit()` (um por município). Município-alvo com ZERO estabelecimentos
colhidos → REPLACE pulado + aviso "sem estabelecimentos no arquivo — dados anteriores
mantidos". `resumo.linhas` conta inserts; audit/DatasetInfo com o runner.

## Casos de borda

- Mês mais recente incompleto no share (upload em andamento da RFB): zip ausente →
  erro audível por arquivo; se QUALQUER zip de Estabelecimentos falhou, a gravação
  inteira é ABORTADA (snapshot parcial geraria REPLACE com menos empresas — proibido);
  falha só em Empresas/Simples degrada com aviso (campos complementares None).
- Linha com contagem de colunas errada: guarda "layout mudou?" — 1ª linha de cada
  arquivo valida a contagem esperada (30/7/7/2) e aborta audível se divergir; linhas
  individuais malformadas depois são puladas e contadas.
- `capital_social` vazio/malformado → None (contado como malformação apenas se a linha
  inteira for inválida).
- Execução inline (dev sem worker): funciona, só mais lenta.

## Testes e gates

- **TDD do núcleo puro**: parse das 3 famílias com CSV sintético no layout oficial
  (posições transcritas no plano), match TOM+UF com `norm_nome_municipio`, matriz
  preferida, junção das passadas, guarda de contagem de colunas, capital com vírgula,
  TOM desconhecido audível.
- Gate: `venv/Scripts/python -m pytest backend/tests -q` exit 0 (248 atuais + novos).
- **E2E real na verificação final**: worker local + 1 município MG pequeno — download
  real dos ~7,6GB (a execução mais longa já testada, ~30-60min), contagens na tabela
  `empresas` coerentes com a página, re-run de idempotência.

## Fora de escopo

- Sócios; histórico mensal (só snapshot corrente); notificações; CNAE secundária;
  estabelecimentos como linhas separadas (o model é 1 linha por empresa/município);
  frontend (a página Empresas já agrega por SQL em cima da tabela).
