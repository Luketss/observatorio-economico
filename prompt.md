Você é um **engenheiro de software staff-level especializado em plataformas de data analytics, dashboards interativos e visualização de dados complexos**.

Seu objetivo é **projetar e desenvolver uma plataforma web completa de observatório econômico municipal**.

A aplicação deve ter **qualidade de produto SaaS profissional**, mesmo sendo construída com **dados mockados e sem backend** Os dados estão nas pastas na raiz do projeto, cada pasta representa uma visualização, muda apenas para a pasta Pacote_Trabalho_Multicidades que possui uma divisão entre CAGED E RAIS. e dentro de cada pasta temos arquivos CSV, se necessário podemos transformar esses arquivos em outro tipo de dado.

---

# CONTEXTO DO PRODUTO

Estamos construindo a plataforma:

**Observatório Econômico**

Ela substituirá dashboards atualmente feitos no PowerBI por uma **plataforma web interativa moderna**.

A aplicação será usada para visualizar **indicadores econômicos de cidades pré selecionadas de Minas Gerais**, incluindo:

* atividade empresarial
* mercado de trabalho
* crédito bancário
* arrecadação
* PIB
* comércio exterior
* benefícios sociais
* setores econômicos

A plataforma deve funcionar como um **hub de inteligência econômica municipal**.

---

# RESTRIÇÕES DO PROJETO

A aplicação deve:

* ser **Single Page Application**
* rodar **100% frontend**
* utilizar **dados mockados**
* não possuir backend
* ser **deployável no Netlify**

Todos os dados estarão na pasta:

```
/data
```

em formato JSON.

---

# OBJETIVO PRINCIPAL

Criar uma plataforma que:

* substitua dashboards PowerBI
* seja extremamente rica visualmente
* tenha gráficos interativos
* permita exploração de dados
* funcione bem em desktop e mobile
* tenha aparência de produto SaaS profissional

---

# STACK OBRIGATÓRIA

Use:

* React
* Vite
* Typescript
* TailwindCSS
* React Router
* Zustand

Para visualização de dados:

* ECharts ou Recharts

Para animações:

* Framer Motion

Para tabelas:

* TanStack Table

Para ícones:

* Lucide Icons

---

# DESIGN SYSTEM

Crie um **design system próprio** para o projeto.

Defina:

### Tipografia

Utilizar:

* Inter
* ou Plus Jakarta Sans

Hierarquia:

```
H1 → título página
H2 → seção dashboard
H3 → título gráfico
Body → texto normal
Caption → labels
```

---

### Paleta de cores

Base inspirada em dashboards SaaS:

```
Primary → azul institucional
Secondary → azul claro
Accent → laranja suave
Success → verde
Warning → amarelo
Danger → vermelho
```

Background:

```
#F8FAFC
```

Cards:

```
#FFFFFF
```

---

### Componentes base

Criar:

```
Button
Card
KpiCard
StatTrend
ChartCard
Section
PageHeader
DataTable
FilterBar
Sidebar
Topbar
Modal
Tooltip
Badge
```

Todos devem ser reutilizáveis.

---

# ESTRUTURA DO PROJETO

```
src
│
├── app
│   ├── router
│   ├── providers
│   └── store
│
├── components
│   ├── charts
│   ├── tables
│   ├── filters
│   ├── kpis
│   ├── layout
│   └── ui
│
├── layouts
│   └── dashboard-layout
│
├── pages
│   ├── login
│   ├── home
│   ├── empresas
│   ├── bancos
│   ├── aposentadorias
│   ├── impostos
│   ├── pib
│   ├── rais
│   ├── comercio-exterior
│   ├── pilares
│   ├── beneficios
│   └── acoes-semde
│
├── data
│   ├── empresas.json
│   ├── rais.json
│   ├── pib.json
│   ├── bancos.json
│   ├── impostos.json
│   ├── comercio_exterior.json
│
├── hooks
├── services
├── utils
└── styles
```

---

# AUTENTICAÇÃO

Criar um sistema de login **mockado**.

Funcionalidades:

* tela de login moderna
* validação simples
* persistência com localStorage
* logout

Credenciais mock:

```
admin
admin123
```

---

# DASHBOARD PRINCIPAL

A tela inicial deve conter **cards navegáveis**.

Cada card representa um módulo:

* Abertura de Empresas
* Dados Bancários
* Painel de Aposentadorias
* Arrecadação com Impostos
* Produto Interno Bruto
* Dados RAIS
* Importações e Exportações
* Pilares Econômicos
* Benefícios Sociais
* Ações SEMDE

Cada card deve conter:

* ícone
* título
* descrição
* animação hover
* navegação

Layout:

grid responsivo estilo **analytics dashboard**.

---

# ESTRUTURA DOS DASHBOARDS

Cada página de módulo deve conter:

## 1 KPIs principais

Exemplo:

```
Total do indicador
Variação anual
Variação mensal
Crescimento percentual
```

---

## 2 Gráficos

Utilizar múltiplos tipos:

* line charts
* bar charts
* stacked bars
* pie charts
* area charts
* scatter plots
* heatmaps

---

## 3 Tabelas analíticas

Com:

* paginação
* ordenação
* filtros
* busca
* exportação CSV

---

# FILTROS GLOBAIS

Criar sistema de filtros estilo PowerBI:

```
Ano
Mês
Setor
Categoria
Região
```

Filtros devem atualizar todos os gráficos da página.

---

# RESPONSIVIDADE

Aplicação deve funcionar perfeitamente em:

* Desktop
* Tablet
* Mobile

Requisitos:

* gráficos responsivos
* sidebar colapsável
* tabelas scrolláveis
* menus adaptáveis

---

# VISUALIZAÇÃO DE DADOS AVANÇADA

Cada dashboard deve ter:

### KPIs com tendências

```
▲ +5.2%
▼ -1.3%
```

### comparações temporais

```
ano atual vs anterior
```

### gráficos com tooltips ricos

---

# MAPAS (EXTRA)

Adicionar módulo de mapa econômico utilizando:

* Leaflet ou Mapbox

Mostrando:

* dados por bairro
* distribuição econômica

---

# ANIMAÇÕES

Utilizar **Framer Motion** para:

* transições de página
* hover de cards
* loading skeletons
* entrada de gráficos

---

# EXPERIÊNCIA DO USUÁRIO

A interface deve parecer um produto como:

* Stripe Dashboard
* Vercel Analytics
* Metabase
* Tableau Cloud
* PowerBI moderno

Características:

* clean
* rápido
* informativo
* moderno

---

# DADOS MOCKADOS

Criar datasets realistas.

### Empresas

```
aberturas
fechamentos
saldo
por setor
```

### Bancos

```
crédito concedido
captação
tipo de operação
```

### RAIS

```
empregos formais
salários médios
setores
```

### PIB

```
evolução anual
comparação regional
```

### Impostos

```
ICMS
ISS
IPTU
IPVA
```

### Comércio exterior

```
exportações
importações
países parceiros
```

---

# PERFORMANCE

Implementar:

* lazy loading de rotas
* memoização de gráficos
* splitting de bundles

---

# ACESSIBILIDADE

Aplicação deve possuir:

* aria labels
* contraste adequado
* navegação por teclado

---

# PREPARAÇÃO PARA FUTURO BACKEND

Embora use dados mockados, estruturar a aplicação como se fosse consumir APIs.

Criar camada:

```
services/
```

exemplo:

```
empresasService.ts
raisService.ts
pibService.ts
```

---

# DEPLOY

Aplicação deve rodar com:

```
npm install
npm run dev
```

Build:

```
npm run build
```

Deploy:

Netlify.

Criar arquivo:

```
netlify.toml
```

para SPA routing.

---

# RESULTADO ESPERADO

A aplicação final deve parecer uma **plataforma profissional de inteligência econômica municipal**, contendo:

* múltiplos dashboards
* gráficos avançados
* filtros dinâmicos
* navegação fluida
* design moderno
* responsividade total

Mesmo utilizando apenas **dados mockados**.

---

# MISSÃO FINAL

Criar um **Observatório Econômico Digital**, que substitua dashboards PowerBI por uma **plataforma web moderna de análise econômica municipal**.

---

## EXTRA (ALTAMENTE RECOMENDADO)

Se o agente tiver capacidade, implementar também:

* Dark Mode
* Exportação de gráficos como imagem
* Exportação CSV
* Compartilhamento de dashboards
* Sistema de bookmarks de filtros
* Download de relatórios
