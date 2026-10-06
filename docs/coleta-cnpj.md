# Coleta CNPJ/RFB a partir de uma máquina no Brasil

## Por que roda local

O servidor de arquivos da Receita Federal (`arquivos.receitafederal.gov.br`)
recusa conexões vindas da faixa de IPs da Railway: derruba a conexão sem
responder (`RemoteDisconnected`), antes de olhar método, caminho ou
autenticação. A mesma requisição feita de uma rede brasileira responde
normalmente (207 em ~0,6 s). Por isso a fonte automática `cnpj` falha sempre
quando executada pelo worker da Railway, e o espelho HTTP antigo
(`/dados/cnpj/dados_abertos_cnpj/`) não existe mais.

A solução é rodar a MESMA fonte numa máquina no Brasil, gravando direto no
Postgres de produção. O job aparece em "Histórico de coletas" no admin, com
auditoria e `dataset_info` iguais aos de uma coleta feita pelo painel.

## Pré-requisitos

- Repositório clonado e venv do backend com as dependências instaladas.
- ~8 GB livres em disco temporário (a coleta baixa ~7,6 GB de zips).
- ~1-1,5 GB de RAM por capital selecionada.
- Conexão estável: a execução leva de 30 a 60+ minutos.
- Um usuário `ADMIN_GLOBAL` ativo (o e-mail dele é o dono do job).

## Apontar para o banco de produção

Não grave credenciais no repositório nem em `.env` versionado. Obtenha a URL
pública do Postgres e exporte as variáveis só no shell da sessão:

```
railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL
```

A URL tem o formato `postgresql://USUARIO:SENHA@HOST:PORTA/BANCO`. Exporte:

PowerShell:

```powershell
$env:POSTGRES_HOST="HOST"
$env:POSTGRES_PORT="PORTA"
$env:POSTGRES_USER="USUARIO"
$env:POSTGRES_PASSWORD="SENHA"
$env:POSTGRES_DB="BANCO"
$env:SECRET_KEY="qualquer-valor"   # so para o Settings validar
```

bash:

```bash
export POSTGRES_HOST=HOST POSTGRES_PORT=PORTA POSTGRES_USER=USUARIO
export POSTGRES_PASSWORD=SENHA POSTGRES_DB=BANCO
export SECRET_KEY=qualquer-valor   # so para o Settings validar
```

## Executar

```
cd backend
python -m app.coletar_cnpj --listar Divin
python -m app.coletar_cnpj --email admin@uaizi.com.br --municipio-id 12 --municipio-id 34
```

- `--listar TEXTO` imprime id, nome e UF dos municípios ativos que contêm o
  texto e sai, sem criar job.
- `--municipio-id` é repetível; no máximo 20 municípios por execução.
- O job nasce já `executando` (o worker da Railway não o reivindica) e roda
  no próprio terminal, bloqueando até terminar. Ao fim imprime status,
  linhas e erros; exit code 0 em sucesso, 1 em falha, 2 para e-mail inválido.
- Só um job por vez: se o admin estiver rodando outra coleta, o comando recusa
  com a mensagem "Já existe uma execução em andamento".
- Se o terminal for interrompido, o job fica sem heartbeat e é marcado
  `abortado` automaticamente em até 10 minutos.
