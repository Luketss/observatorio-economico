# Gestão Empresarial (Fase 3 da reorganização em 5 eixos) — Design

**Data:** 2026-08-19
**Status:** aprovado pelo usuário (2026-08-19 — backend liberado; estruturas separadas para contatos e demandas; substituição do item Retenção & Expansão na mesma URL; abordagem "evoluir a tela atual")

## Objetivo

Entregar o módulo 14 do roadmap (nome do cliente: **"Gestão Empresarial"**),
fundindo a base de **Empresas (CNPJ/RFB)** com a lógica de **Retenção &
Expansão** numa experiência única de relacionamento com empresas: perfil,
contatos, visitas, demandas, riscos, responsável e próxima ação. A retenção
continua existindo como processo DENTRO do módulo (documento original:
"experiência integrada em vez de isolada").

## Decisões aprovadas

- **Backend incluído** (migração Alembic + endpoints novos) — deploy da api
  entra no pacote da fase.
- **Estruturas separadas:** tabelas próprias `contato_empresa` e
  `demanda_empresa`, além da `visita_retencao` existente (mantida como está).
  Rejeitado: generalizar visitas em "interações" únicas.
- **Substituição na mesma URL:** o item da sidebar vira "Gestão Empresarial"
  e a página de `/app/desenvolvimento-economico/retencao` vira a experiência
  fundida. URL e chave de plano `desenvolvimento_economico.retencao`
  **intocadas**. Rejeitado: coexistência de duas telas.
- **Abordagem A — evoluir a tela atual:** grid de cards + KPIs preservados;
  a novidade concentra-se no drawer (abas) e no formulário (vínculo RFB).
- **Política ADMIN_GLOBAL unificada** no padrão view-as (`needsMunicipio` +
  `SelecioneMunicipio`), substituindo o bloqueio total atual da tela — e o
  backend de retenção passa a respeitar `?municipio_id=` na leitura (ataca o
  débito conhecido "view-as não escopa").
- `EmpresasPage` (dashboard analítico, Eixo 3) **fica intocada**.

## Arquitetura — Backend

### 1. Migração (uma revision nova)

Em `empresa_retencao`:
- `cnpj_basico` String(8) nullable, **index** — raiz normalizada do CNPJ
  (strip de máscara + 8 primeiros dígitos), preenchida pelo backend a partir
  do vínculo escolhido no autocomplete (ou derivada do campo `cnpj` quando
  válido). Sem FK física (a base `empresas` é recarregável por REPLACE;
  vínculo lógico por `(municipio_id, cnpj_basico)`).
- `proxima_acao` Text nullable + `proxima_acao_data` Date nullable (molde do
  Funil).

Tabelas novas (ambas: `id` PK, `empresa_id` FK `empresa_retencao.id`
ondelete CASCADE index, `municipio_id` FK index NOT NULL, `criado_por` FK
`usuarios.id` nullable, `criado_em`/`atualizado_em` DateTime tz):
- **`contato_empresa`**: `data` Date NOT NULL, `tipo` String(20) NOT NULL
  default `"reuniao"` (`reuniao|ligacao|email|visita_tecnica|outro`),
  `responsavel` String(150) nullable, `observacoes` Text nullable.
- **`demanda_empresa`**: `descricao` Text NOT NULL, `status` String(20)
  NOT NULL default `"aberta"` (`aberta|em_andamento|resolvida`),
  `data_registro` Date NOT NULL, `responsavel` String(150) nullable.

### 2. Endpoints

Router `desenvolvimento_economico.py` (mesmo prefixo):
- `POST/PUT` de empresa aceitam `cnpj_basico` opcional (validação: 8 dígitos
  ou null) e `proxima_acao`/`proxima_acao_data`.
- `GET /retencao/{id}` (detalhe) passa a incluir `contatos: []`,
  `demandas: []` e `perfil_rfb: EmpresaOut | null` (lookup por
  `(municipio_id, cnpj_basico)` na tabela `empresas`; `null` quando sem
  vínculo ou sem dado). Visitas continuam como hoje.
- CRUD novo, espelhando o padrão das visitas (escrita
  `require_permissao("retencao", ...)`):
  - `POST /retencao/{id}/contatos` · `PUT /retencao/contatos/{id}` ·
    `DELETE /retencao/contatos/{id}`
  - `POST /retencao/{id}/demandas` · `PUT /retencao/demandas/{id}` ·
    `DELETE /retencao/demandas/{id}`
  (PUT existe porque demandas mudam de `status` e contatos são editáveis —
  diferente das visitas, imutáveis por design atual.)
- **Leitura com view-as:** `GET /retencao` e `GET /retencao/{id}` aceitam
  `municipio_id` opcional honrado só para ADMIN_GLOBAL (padrão
  `municipio_scope` usado nas bases de dados), mantendo `get_current_user`.
- Router `empresas.py`: endpoint novo `GET /empresas/buscar?q=` —
  `scoped_modulo("empresas")`, `ilike` sobre `razao_social`/`nome_fantasia`
  + prefixo de `cnpj_basico` quando `q` for numérico, `limit 10`, response
  `List[EmpresaOut]` (schema órfão existente passa a ser usado).
- `AREA_LABELS["retencao"]` → `"Gestão Empresarial"` (chave `retencao`
  intocada em roles/permissões).

### 3. Schemas

`ContatoEmpresaCreate/Update/Out`, `DemandaEmpresaCreate/Update/Out` (com
validação de `tipo`/`status` por `Literal`), `EmpresaRetencaoOut` ganha
`contatos`, `demandas`, `perfil_rfb`, `proxima_acao`, `proxima_acao_data`,
`cnpj_basico`; `EmpresaRetencaoLeanOut` ganha `proxima_acao`,
`proxima_acao_data`, `cnpj_basico`.

## Arquitetura — Frontend

Tudo na página atual `RetencaoTab.jsx` (renomeio interno de componente é
livre; a rota/arquivo permanecem — ou o arquivo é renomeado para
`GestaoEmpresarialTab.jsx` com import atualizado, a critério do plano).

- **Header:** título "Gestão Empresarial", sub "Relacionamento com empresas —
  perfil, contatos, demandas, retenção e expansão". Sidebar: label
  "Gestão Empresarial" (mesma rota/chave).
- **KPIs e grid de cards preservados**; card ganha linha de próxima ação
  (`proxima_acao` + data, quando houver).
- **Drawer com abas** (`NidTabBar`):
  1. **Perfil** — dados manuais atuais + seção "Base RFB" quando
     `perfil_rfb` presente (razão social, situação, porte, CNAE, capital,
     abertura); a seção RFB fica sob `PlanGate planKey="empresas"`
     (município sem a base no plano vê teaser). Próxima ação editável em
     destaque no topo (permissão `retencao.editar`).
  2. **Contatos & Visitas** — timeline única mesclada por data (contatos +
     visitas, com badge de tipo), com os formulários de registro respectivos
     (visita mantém foto; contato tem tipo/observações).
  3. **Demandas** — lista com status (pill), criação/edição/mudança de
     status/exclusão.
- **Formulário de empresa** ganha autocomplete "Vincular à base CNPJ"
  (busca `GET /empresas/buscar` com debounce; selecionar preenche
  `cnpj_basico` e sugere razão social; vínculo é opcional — empresa sem
  vínculo continua válida). Se o plano não inclui `empresas`, o autocomplete
  não aparece (canAccess).
- **Guard ADMIN_GLOBAL:** `needsMunicipio` + `SelecioneMunicipio`; com
  view-as ativo a tela funciona (leitura); escrita continua bloqueada para
  global (comportamento backend atual preservado).

## Testes

- Backend (pytest): busca de empresas (match por nome/cnpj, tenant, plano);
  CRUD de contatos e demandas (permissões por verbo, tenant, cascade);
  detalhe com `perfil_rfb` (com/sem vínculo, view-as); validação de
  `tipo`/`status`; migração roda no deploy.
- Front (vitest/jsdom): abas do drawer; timeline mesclada ordena por data;
  CRUDs mockados; autocomplete (debounce + seleção preenche vínculo);
  PlanGate da seção RFB; guard `needsMunicipio`; label/título novos
  (invariantes de navegação + teste estático de títulos atualizados).
- Suites completas front (baseline 267) e back (baseline 406) verdes.

## Fora de escopo

- "Relevância/score" automático de empresas; vínculo de marcos da Timeline
  com empresas; importação em massa de empresas; mudanças na `EmpresasPage`;
  renomear a chave de plano ou a área de permissão (`retencao` permanece);
  histórico de alterações de status de demanda (só o status atual).

## Riscos

- **Migração em produção:** revision nova precisa rodar no deploy da api
  (padrão da casa; anotar no checklist de deploy).
- **Match RFB parcial:** `cnpj_basico` é raiz (8 dígitos) — filiais colapsam
  na matriz; aceito (a base `empresas` já é assim).
- **Dois regimes de gating na mesma tela** (permissão `retencao` para
  escrita; plano `empresas` só para a seção RFB/autocomplete): documentado
  acima; a chave do item na sidebar segue `desenvolvimento_economico.retencao`.
- **Drawer mais denso:** mitigado pelas abas; a aba Perfil abre por padrão.
