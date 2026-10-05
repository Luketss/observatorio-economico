# Tratamento de Dados Pessoais no Observatório Econômico

Este documento descreve como o Observatório Econômico trata dados pessoais no
âmbito da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD"). Ele se
destina às prefeituras contratantes da plataforma e serve como referência
para revisão jurídica e de contratação.

## 1. Papéis e responsabilidades (art. 39 e 42 da LGPD)

A prefeitura contratante é a **controladora** dos dados pessoais tratados na
plataforma: é ela quem decide as finalidades e os meios do tratamento,
inclusive quais servidores têm acesso ao sistema e com qual perfil de
permissão.

O Observatório Econômico atua como **operadora**: trata os dados pessoais em
nome da controladora, seguindo as instruções definidas neste documento e no
contrato de prestação de serviços firmado entre as partes. A operadora não
utiliza os dados pessoais tratados na plataforma para finalidade própria,
alheia ao objeto do contrato.

## 2. Inventário de dados pessoais tratados (art. 37)

A plataforma trata três classes de dados pessoais:

**(a) Contas de usuário.** Para cada servidor com acesso ao sistema: nome,
e-mail, hash de senha (com o algoritmo bcrypt — a senha em texto claro nunca
é armazenada), papel de acesso (role), município de vínculo e data do último
login.

**(b) Registros de acesso e ações.** A plataforma mantém uma trilha de
auditoria composta por duas tabelas: `login_audit`, que registra as
tentativas de autenticação (e-mail informado, endereço IP, identificador de
navegador — user-agent, sucesso ou falha e data/hora); e `acao_audit`, que
registra ações administrativas e leituras de dados pessoais realizadas por
usuários autenticados (autor, alvo quando aplicável, ação realizada,
endereço IP, identificador de navegador e data/hora).

**(c) Notificações internas ao usuário.** Avisos e comunicados exibidos
dentro da plataforma, associados ao usuário que os recebe e ao registro de
leitura.

**Delimitação.** Os indicadores econômicos e sociais exibidos no
observatório (PIB, CAGED, FPM, IPS e demais fontes) são agregados públicos
por município e não constituem dados pessoais. O módulo de empresas trata
dado cadastral de pessoa jurídica, obtido da base pública da Receita Federal
do Brasil, sem quadro societário e sem CPF de sócios ou representantes. A
medição de uso das telas (analytics, seção 8) trata apenas dados técnicos e
agregados, sem identificação direta do usuário.

## 3. Bases legais (art. 7º)

O tratamento de dados de contas de usuário tem como base legal a execução de
contrato e de procedimentos preliminares relacionados a contrato do qual o
titular é parte (art. 7º, V), já que o acesso à plataforma decorre do
vínculo funcional do servidor com a prefeitura contratante.

O tratamento de registros de acesso tem duas bases legais concorrentes: o
cumprimento de obrigação legal (art. 7º, II), em razão da guarda mínima de
seis meses dos registros de acesso a aplicações de internet exigida pelo
art. 15 da Lei nº 12.965/2014 (Marco Civil da Internet); e o legítimo
interesse em segurança da informação (art. 7º, IX), que fundamenta a
extensão do prazo além do mínimo legal, conforme detalhado na seção 4.

## 4. Retenção e descarte

Os registros de acesso (tentativas de login e leituras de dados pessoais
registradas em `acao_audit` com categoria "leitura") são retidos por **12
meses**. As ações administrativas registradas em `acao_audit` com categoria
"acao" são retidas por **5 anos**.

Esses prazos são aplicados por uma rotina de purga automática executada na
inicialização da aplicação, definida em
`backend/app/services/audit_service.py` nas constantes
`RETENCAO_ACESSOS_MESES` (12) e `RETENCAO_ACOES_ANOS` (5). Este documento e o
código são mantidos em sincronia: qualquer alteração de prazo é refletida
nos dois lugares. Para efeito de cálculo, a rotina aproxima 12 meses a 365
dias e 5 anos a 1.825 dias.

Quando uma conta de usuário é excluída, seu cadastro é removido em
definitivo da plataforma. A trilha de auditoria, no entanto, preserva o
e-mail do usuário como um retrato do momento da ação (snapshot), pelos
prazos descritos acima, com base no cumprimento de obrigação legal (art. 16,
I) e no legítimo interesse em manter a rastreabilidade de acessos e ações
administrativas já registrados.

## 5. Medidas de segurança (art. 46)

A plataforma adota as seguintes medidas técnicas e organizacionais:

- Senhas armazenadas exclusivamente como hash bcrypt, nunca em texto claro,
  com defesa contra enumeração de contas por tempo de resposta constante na
  autenticação.
- Autenticação por token JWT.
- Controle de acesso por papéis (roles), com negação por padrão
  (fail-closed) para quem não tem permissão explícita e escopo por
  município — um usuário municipal não visualiza dados de outros
  municípios.
- Limitação de taxa de requisições (rate limiting) em rotas sensíveis.
- Criptografia em trânsito (TLS), provida pela infraestrutura de hospedagem
  (Railway).
- Documentação interativa da API (Swagger/OpenAPI) desabilitada em
  produção, para reduzir a superfície de informação exposta publicamente.
- Trilha de auditoria de tentativas de login, ações administrativas e
  leituras de dados pessoais, conforme descrito na seção 2.
- Logs de aplicação com identificador de correlação por requisição, que
  permitem reconstruir a sequência de eventos em uma investigação.

## 6. Direitos do titular (art. 18) e canal de atendimento

O titular dos dados pessoais tratados pela plataforma tem direito à
confirmação da existência de tratamento, ao acesso aos seus dados, à
correção de dados incompletos, inexatos ou desatualizados, à eliminação de
dados tratados com consentimento (quando aplicável) e à informação sobre as
entidades com as quais o controlador realizou uso compartilhado de dados.

Como a plataforma atua como operadora, o exercício desses direitos segue o
seguinte fluxo: o titular aciona a prefeitura (controladora), que por sua
vez aciona a operadora pelo canal de atendimento definido no contrato de
prestação de serviços. A operadora responde à controladora em até 15 dias
contados do acionamento.

## 7. Incidentes de segurança (art. 48)

Incidentes de segurança que possam acarretar risco ou dano relevante aos
titulares são identificados por meio da trilha de auditoria e dos logs de
aplicação descritos na seção 5.

Ao identificar um incidente, a operadora comunica a controladora em prazo
razoável, informando a natureza dos dados pessoais afetados, os titulares
envolvidos e as medidas técnicas adotadas para conter e remediar o
incidente. Controladora e operadora avaliam em conjunto a necessidade de
comunicação à Autoridade Nacional de Proteção de Dados (ANPD) e aos
titulares afetados, conforme os critérios do art. 48 da LGPD.

## 8. Analytics de uso (Umami)

A plataforma mede o uso das telas por meio de uma instância própria do
Umami, software de analytics de código aberto, hospedada pela operadora na
Railway e compartilhada com a plataforma Inteligência Legislativa (LEGIS). O
objetivo é saber quais páginas e módulos são utilizados, por quais municípios
e papéis de acesso, para orientar a evolução do produto.

**O que é coletado.** Para cada visita: página acessada (apenas o caminho,
sem parâmetros de busca), referenciador, data/hora, atributos técnicos do
navegador (navegador, sistema operacional, tipo de dispositivo, resolução de
tela e idioma) e a localização aproximada (país, região e cidade) derivada
do endereço IP. O IP em si não é armazenado: o Umami o utiliza para derivar
a localização e para compor um hash de sessão com salt rotacionado
diariamente, e o descarta. Não são utilizados cookies nem identificadores
persistentes no navegador.

**O que a plataforma acrescenta à sessão.** Apenas o identificador numérico
do município de vínculo e o papel de acesso do usuário, restrito aos papéis
do sistema (`ADMIN_GLOBAL`, `ADMIN_MUNICIPIO`, `ANALISTA`, `VISUALIZADOR`).
Papéis personalizados criados pela prefeitura são enviados como
`PERSONALIZADO`, para que o nome livre de um papel nunca identifique uma
pessoa. Identificador do usuário, nome e e-mail nunca são enviados, e a
sessão não é associada a um identificador único de pessoa.

**Identificabilidade.** Município é ente público e papel de acesso é
atributo funcional. Em municípios com um único titular de determinado papel
(por exemplo, um único `ADMIN_MUNICIPIO`), a combinação município + papel
pode tornar a sessão indiretamente identificável pela operadora, que
administra as contas. Por isso a operadora não cruza os dados de analytics
com o cadastro de usuários, o acesso ao painel do Umami é restrito ao
administrador global da plataforma e o conjunto de dados enviados é o mínimo
descrito acima. O tratamento tem como base legal o legítimo interesse na
melhoria do serviço (art. 7º, IX), compatível com a expectativa de um
servidor que utiliza ferramenta de trabalho fornecida pela prefeitura.

**Retenção.** Os registros de analytics não compõem a trilha de auditoria e
não seguem os prazos da seção 4. São mantidos enquanto úteis à evolução do
produto e podem ser apagados por website, a qualquer momento, pela função
nativa do Umami. O rastreio existe apenas no build de produção; em ambiente
de desenvolvimento nada é enviado. Detalhes operacionais em
`docs/analytics-umami.md`.
