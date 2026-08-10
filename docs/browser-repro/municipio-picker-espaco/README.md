# Barra de espaço fechava a busca de município

Reprodução executável do bug corrigido em 09/08/2026 no `MunicipioPicker`.

## O comportamento

Um `<input>` aninhado dentro de um `<button>` faz o Chromium, ao receber a barra
de espaço com o input focado, **digitar o espaço E disparar um click sintético
(`detail=0`) no `<button>` ancestral**. No componente, esse click caía no
`onClick` que alternava `setOpen(false)` — e a lista de busca fechava sozinha.

Aninhar controle interativo dentro de `<button>` também é HTML inválido.

## Por que isto está versionado

O jsdom **não** emula esse click sintético: um teste de comportamento em
`MunicipioPicker.test.jsx` passa mesmo com o bug presente. A guarda de regressão
real é o teste de aninhamento (`nenhum controle interativo fica aninhado em
button`), e o *porquê* dela mora aqui.

Se alguém no futuro achar que a marcação do picker está complicada à toa e quiser
voltar a um `<button>` único envolvendo tudo, rode isto antes.

## Como rodar

```bash
npm i playwright        # num diretório qualquer fora do projeto
node run.mjs            # usa o Edge/Chromium já instalado (channel: 'msedge')
```

Saída esperada (o bug acontecendo):

```
RESULTADO: {"cliques":1,"valor":"bom jesus"}
log: cliques=1 target=btn detail=0     <- click sintético no button ancestral
CONTROLE (button focado): cliques=2    <- ativação nativa normal, para comparação
```
