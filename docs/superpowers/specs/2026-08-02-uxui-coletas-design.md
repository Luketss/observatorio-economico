# UX da tela de coletas (Fontes de Dados admin) — Design

**Data:** 2026-08-02
**Status:** aprovado pelo usuário

## Contexto e problemas

`DatasetFontesAdminPage.jsx` nasceu como editor de metadados (fonte/data de cada dataset para tooltips) e ganhou depois a esteira de fontes automáticas. Problemas hoje:

1. Copy do cabeçalho fala só de metadados; a função principal virou executar coletas.
2. Botões teal hardcoded (`bg-teal-600`) fora do sistema de tema (`--admin-accent`), status com cores hardcoded (`text-emerald-500` etc.).
3. **Erro de job truncado em 120 caracteres** no histórico — o erro SSL do comex (job 16) não era legível na tela; foi preciso ler o banco.
4. `confirm()` nativo (rodar todas sem filtro, limpar fonte) destoa do padrão NidModal do admin.
5. Hierarquia confusa: "Rodar todas" e 12 botões individuais com o mesmo peso visual.
6. 12 cards empilhados = rolagem longa para achar uma fonte.

## Mudanças (padrão nid, componentes existentes)

1. **StatusChip** — chip pequeno de status de job (Concluído/Erro/Aviso/Abortado/Executando/Na fila) com cores via token (`--ok`/`--err`/`--warn` ou `color-mix` com os accents do tema — conferir tokens existentes na implementação; Executando com spinner). Usado nos cards/tabela de fontes e no histórico. Componente local da página ou em `components/nid/` se trivialmente reutilizável.
2. **Modal de detalhes do job** (NidModal): linha do histórico clicável abre modal com erro completo (sem truncar, com quebra de linha), filtros usados (UF/municípios/anos/notificar), duração, e — para o meta-job "todas" — tabela por fonte (status, linhas, erros). Resolve o problema 3.
3. **Hierarquia de botões**: "Rodar todas as fontes" continua sólido primário (accent). Botões individuais "Atualizar agora" viram secundários/outline compactos (mesmo padrão dos botões "Reprocessar" da DatasetsAdminPage: fundo `color-mix` 12%, borda 35%, texto accent). Tudo com `var(--admin-accent)`, zero teal fixo.
4. **Fontes como DataTable** (componente C3): colunas Fonte (label + fonte truncada) | Última execução (StatusChip + data + linhas) | Ação (botão compacto). Linha da fonte em execução mostra barra de progresso + etapa logo abaixo (linha expandida), como hoje nos cards. Avisos específicos (captação federal/UF) viram tooltip/nota na célula.
5. **`confirm()` → NidModal** nos dois usos (rodar todas sem filtro; limpar fonte de dataset).
6. **Copy nova**: título "Coletas e fontes de dados"; seção de execução primeiro ("Coletas automáticas"), tabela de metadados depois ("Metadados exibidos nos tooltips").

## O que NÃO muda

- Endpoints e polling (3 s) — só apresentação.
- Filtros (UF, municípios, anos, notificar) — mesma semântica; apenas realinhados no painel.
- Tabela de metadados (inputs de fonte/data) — só desce na página e ganha o título correto.

## Testes e verificação

- Suíte frontend (vitest) verde; teste do StatusChip (mapa status→rótulo) e do modal de detalhes (erro completo renderizado, resumo por fonte no caso "todas") se a página tiver testes; senão, conferência visual.
- Conferência visual nos 5 temas (checklist rápido: chips, botões accent, modal).

## Fora de escopo

- Botão cancelar job (exige endpoint + cancelamento cooperativo no runner) — candidato a próximo subprojeto.
- Mudanças na DatasetsAdminPage (limpeza/reingestão) além de nenhuma.
- Agendamento/cron de coletas.
