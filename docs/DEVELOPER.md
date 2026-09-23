# Portal BI do DER-PE — Guia do Desenvolvedor

**Público-alvo:** Desenvolvedor responsável por manter, estender ou criar novos painéis no portal. Leia o `OVERVIEW.md` antes para entender o contexto do sistema.

---

## 1. Stack e Dependências

### Backend (Python 3.12)

| Biblioteca | Responsabilidade |
|---|---|
| FastAPI (async) | Framework web — rotas, validação, serialização |
| SQLAlchemy 2.x async | ORM para o PostgreSQL local do portal |
| Alembic | Migrations do banco de dados |
| APScheduler | Jobs periódicos (atualização automática de relatórios) |
| httpx async | Cliente HTTP para comunicação com o Superset |
| PyJWT + bcrypt | Autenticação JWT e hash de senhas |
| openpyxl | Exportação de relatórios para Excel |
| redis-py | Cache de queries do DWH |
| pydantic-settings | Carregamento de variáveis de ambiente via `.env` |

### Frontend (Node.js 20+)

| Biblioteca | Responsabilidade |
|---|---|
| React 18 | UI framework |
| TypeScript 5 | Tipagem estática |
| Vite 5 | Build tool e dev server |
| React Router 6 | Roteamento SPA |
| TanStack React Query 5 | Cache e fetch de dados do backend |
| Axios | Cliente HTTP (encapsulado em `api.ts`) |
| Tailwind CSS 3 | Estilização utilitária |
| Lucide React | Ícones (única lib de ícones — não adicionar outras) |
| Apache ECharts | Gráficos interativos |

---

## 2. Rodar Localmente

### Pré-requisitos

- Docker Desktop instalado e rodando
- Acesso à rede da Softplan (presencial ou VPN) — o Superset e o DWH estão no ambiente da Softplan e não são acessíveis de fora
- Node.js 20+ (somente para build do frontend fora do Docker)

### Configuração inicial

```bash
# 1. Copiar o arquivo de variáveis de ambiente
cp backend/.env.example backend/.env

# 2. Preencher os valores em backend/.env (ver tabela na seção 9)

# 3. Subir todos os serviços
docker compose up -d

# 4. Build do frontend (necessário após qualquer mudança React)
cd frontend
npx vite build

# 5. Verificar que tudo está rodando
docker compose ps
docker compose logs backend --tail=30
```

Acesse em: `http://localhost:8081`

### Ciclo de desenvolvimento

```
Mudança Python ou query.sql  →  docker compose restart backend
Mudança React/TypeScript      →  cd frontend && npx vite build  →  Ctrl+Shift+R no browser
```

> **Por que o Ctrl+Shift+R?** O nginx serve os arquivos do `dist/` com cache agressivo. O hard refresh força o browser a baixar os arquivos novos.

---

## 3. Estrutura do Projeto

```
portal/
├── backend/
│   ├── app/
│   │   ├── auth/
│   │   │   ├── router.py      # POST /auth/login, logout, /me, change-password, profile
│   │   │   ├── deps.py        # get_current_user, require_admin, require_publisher
│   │   │   └── service.py     # hash_password, verify_password, create_access_token
│   │   ├── admin/
│   │   │   └── router.py      # CRUD de usuários, grupos, relatórios, permissões, cronograma
│   │   ├── portal/
│   │   │   └── router.py      # relatórios publicados + queries ao vivo (assinaturas, etc)
│   │   ├── reports/
│   │   │   ├── __init__.py    # _build_catalog() — lê as pastas e monta CATALOG global
│   │   │   ├── extracoes/
│   │   │   │   ├── contratos/ # meta.json + query.sql
│   │   │   │   └── medicoes/  # meta.json + query.sql
│   │   │   └── paineis/
│   │   │       └── fluxo-medicoes/ # meta.json + query.sql
│   │   ├── db/
│   │   │   ├── models.py      # User, Group, Report, ReportSnapshot, RefreshLog, ReportPermission
│   │   │   └── session.py     # async engine, get_db dependency
│   │   ├── superset/
│   │   │   └── client.py      # SupersetClient — autenticação 3 passos + query execution
│   │   ├── config.py          # Settings via pydantic-settings (lê .env)
│   │   └── main.py            # startup, lifespan, CORS, routers, static files
│   ├── alembic/               # Migrations do PostgreSQL local
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login/          # Formulário de login
        │   ├── Portal/         # Grid de cards de relatórios publicados
        │   ├── Report/         # Página de relatório — carrega painel pelo slug
        │   ├── Admin/          # CRUD de usuários, grupos, relatórios, permissões
        │   ├── Cronograma/     # Editor de cronograma de medições
        │   ├── Profile/        # Edição de perfil do usuário
        │   └── ChangePassword/ # Troca de senha forçada no primeiro acesso
        ├── reports/
        │   └── fluxo-medicoes/
        │       ├── index.tsx   # export { Panel } — componente do painel
        │       └── Thumbnail.tsx # export { Thumbnail } — miniatura para o card
        ├── panels/
        │   └── registry.ts    # Auto-discover de painéis via import.meta.glob
        ├── components/        # KpiCard, EChart, ComboBox, MonthPicker, etc
        ├── layouts/
        │   └── PortalLayout.tsx # Header + sidebar + área de conteúdo
        ├── context/
        │   ├── AuthContext.tsx  # Estado do usuário autenticado
        │   └── ThemeContext.tsx # Tema dark/light
        ├── services/
        │   └── api.ts           # Toda a camada HTTP — nunca usar axios diretamente nos componentes
        ├── App.tsx              # React Router — definição de todas as rotas
        └── main.tsx             # Entry point — providers (Query, Auth, Theme, Router)
```

---

## 4. Como Adicionar um Novo Relatório (Snapshot)

Relatórios snapshot executam uma query no DWH e armazenam o resultado em JSON. Ideal para dados agregados que não precisam de parâmetros dinâmicos.

```mermaid
flowchart TD
    A["Criar pasta\nbackend/app/reports/<categoria>/<slug>/"] --> B["Criar meta.json"]
    B --> C["Criar query.sql"]
    C --> D["docker compose restart backend"]
    D --> E["Admin → Relatórios\nConfigurar e publicar"]
    E --> F["Clicar em 'Atualizar dados'\npara gerar o primeiro snapshot"]
    F --> G["Criar painel React opcional\n(ver seção 5)"]
```

### Passo 1 — Criar a pasta

```
backend/app/reports/<categoria>/<slug>/
```

Categorias existentes: `extracoes/` e `paineis/`. Crie novas categorias se fizer sentido temático.

Exemplo:
```
backend/app/reports/extracoes/convenios/
```

### Passo 2 — Criar `meta.json`

```json
{
  "title": "Convênios",
  "description": "Extração de convênios ativos por categoria de obra.",
  "refresh_schedule": "0 6 * * *",
  "tipos": ["Extração"]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `title` | Sim | Nome exibido no card e na página do relatório |
| `description` | Não | Subtítulo do card no portal |
| `refresh_schedule` | Não | Cron expression para atualização automática |
| `tipos` | Não | Tags do relatório. Default: `["Extração"]` para relatórios na pasta `extracoes/` |

### Passo 3 — Criar `query.sql`

A query é executada no schema `siderdwh`. Consulte a seção 7 para as convenções de SQL.

```sql
SELECT
    c.cdtitulo          AS contrato,
    c.nmdescricao       AS descricao,
    c.vltotal           AS valor_total,
    c.dtinicio::text    AS data_inicio,
    c.dtfim::text       AS data_fim
FROM ebisdcontrato c
WHERE c.flactive = 'S'
ORDER BY c.dtinicio DESC
```

### Passo 4 — Reiniciar o backend

```bash
docker compose restart backend
```

> O catálogo de relatórios é construído **uma única vez na inicialização**. Mudanças em `meta.json` ou `query.sql` só têm efeito após restart.

### Passo 5 — Configurar e publicar no Admin

1. Acesse Admin → Relatórios
2. O novo relatório aparece com status `draft`
3. Defina imagem de capa, descrição, permissões de acesso
4. Clique em "Atualizar dados" para gerar o primeiro snapshot
5. Mude o status para `published` para torná-lo visível no portal

---

## 5. Como Adicionar um Novo Painel Customizado

Painéis customizados são componentes React que recebem os dados do snapshot e os renderizam visualmente. O relatório (seção 4) precisa existir primeiro.

```mermaid
flowchart TD
    A["Relatório criado e publicado\n(meta.json + query.sql)"] --> B["Criar componente\nfrontend/src/reports/<slug>/index.tsx\nexportando { Panel }"]
    B --> C["Opcional: Thumbnail\nfrontend/src/reports/<slug>/Thumbnail.tsx\nexportando { Thumbnail }"]
    C --> D["O registry.ts detecta\nautomaticamente via import.meta.glob"]
    D --> E["Build: cd frontend && npx vite build"]
    E --> F["Testar em /relatorio/<slug>"]
```

> O arquivo `registry.ts` usa `import.meta.glob` — **não é necessário editá-lo**. Basta criar o arquivo no caminho correto que o painel é descoberto automaticamente.

### 5.1 Sem IA — Implementação manual

**Estrutura do componente:**

```typescript
// frontend/src/reports/meu-painel/index.tsx

interface Row {
  contrato: string
  valor_total: number
  status: string
}

interface Props {
  data: Row[]
}

export function Panel({ data }: Props) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total de Contratos</p>
          <p className="text-3xl font-bold text-gov-blue mt-2">{data.length}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contrato
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valor Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">{row.contrato}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {row.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Thumbnail opcional** (miniatura exibida no card do portal):

```typescript
// frontend/src/reports/meu-painel/Thumbnail.tsx
export function Thumbnail() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gov-blue/5 rounded-lg">
      <span className="text-xs text-gov-blue font-medium">Meu Painel</span>
    </div>
  )
}
```

### 5.2 Com IA — Usando Claude Code

O arquivo `CLAUDE.md` já instrui o Claude sobre todas as convenções do projeto. Com esse contexto, um prompt bem escrito gera um painel funcional e aderente ao padrão.

**Template de prompt eficaz:**

```
Crie um novo painel customizado para o relatório de slug "convenios".

A query já existe e retorna as seguintes colunas (tipos exatos):
- contrato (string) — código do contrato ex: "PE-999/2024"
- descricao (string) — nome do objeto do contrato
- valor_total (number) — valor em reais
- data_inicio (string ISO) — ex: "2024-01-15"
- data_fim (string ISO) — ex: "2026-12-31"
- status (string) — "Em vigor" | "Encerrado" | "Suspenso"

O painel deve conter:
1. Três KPI cards: total de contratos, soma dos valores "Em vigor", contagem "Encerrado"
2. Gráfico de barras horizontal (ECharts) com os 10 maiores contratos por valor
3. Tabela com todos os contratos, com campo de busca por texto e filtro de status

Seguir as convenções do CLAUDE.md: Tailwind, cores gov-blue/gov-yellow, Lucide icons,
sem CSS avulso, sem Redux. Arquivo: frontend/src/reports/convenios/index.tsx,
exportando { Panel }.
```

**Checklist após geração com IA:**

- [ ] O componente exporta `Panel` (não `default export`)
- [ ] Nenhum CSS avulso criado (somente Tailwind)
- [ ] Apenas ícones Lucide (`lucide-react`)
- [ ] Nenhuma nova dependência adicionada ao `package.json`
- [ ] Build passa sem erros: `cd frontend && npx vite build`
- [ ] Painel aparece corretamente em `/relatorio/convenios`

---

## 6. Visuais Padronizados

### Paleta de cores

| Classe Tailwind | Uso |
|---|---|
| `text-gov-blue` / `bg-gov-blue` | Ações primárias, cabeçalhos, números de KPI |
| `bg-gov-blue-dark` | Estados de hover, destaques |
| `text-gov-yellow` / `bg-gov-yellow` | Alertas, badges secundários |
| `text-gray-900` | Texto principal de dados |
| `text-gray-500` | Labels, subtítulos, metadados |
| `border-gray-200` | Bordas de cards e tabelas |

### KPI Card

```tsx
<div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
  <div className="flex items-center justify-between">
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <SomeIcon className="h-5 w-5 text-gov-blue opacity-60" />
  </div>
  <p className="text-3xl font-bold text-gov-blue mt-2">{value}</p>
  <p className="text-xs text-gray-400 mt-1">{sublabel}</p>
</div>
```

### Tabela de dados

```tsx
<div className="overflow-x-auto rounded-xl border border-gray-200">
  <table className="min-w-full divide-y divide-gray-200 text-sm">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Coluna
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-gray-200">
      {rows.map((row, i) => (
        <tr key={i} className="hover:bg-gray-50 transition-colors">
          <td className="px-4 py-3 text-gray-900">{row.coluna}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Gráfico ECharts

```tsx
import { EChart } from '../../components/EChart'

const option = {
  tooltip: { trigger: 'axis' },
  color: ['#1a56db', '#f3a10e'],  // gov-blue, gov-yellow
  xAxis: { type: 'category', data: labels },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: values }],
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
}

<EChart option={option} style={{ height: 320 }} />
```

### Ícones Lucide

Sempre importar de `lucide-react`. Tamanhos padrão:

| Contexto | Tamanho |
|---|---|
| Texto inline | `h-4 w-4` |
| Botões e ações | `h-5 w-5` |
| Cabeçalhos de seção | `h-6 w-6` |
| KPI cards | `h-5 w-5` com `opacity-60` |

### Campo de busca

```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
  <input
    type="text"
    placeholder="Buscar..."
    value={search}
    onChange={e => setSearch(e.target.value)}
    className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-gov-blue/30 focus:border-gov-blue
               w-full"
  />
</div>
```

---

## 7. Convenções do DWH (`siderdwh`)

### Nomenclatura das tabelas

| Prefixo | Tipo | Contém |
|---|---|---|
| `ebisf*` | Fato | Dados transacionais, chaves surrogate (`sk*`), flags (`fl*`) |
| `ebisd*` | Dimensão | Atributos desnormalizados, descrições, títulos, datas formatadas |

### Tabelas mais usadas

| Tabela | Chave | O que tem |
|---|---|---|
| `ebisfmedicaocontrato` | `skmedicao`, `skcontrato` | Medições por contrato, `flaprovada`, `flactive` |
| `ebisdmedicaocontrato` | `skmedicao` | `nutitulo`, `nuseqmedicaoh` — metadados da medição |
| `ebisdcontrato` | `skcontrato` | `cdtitulo`, `nmdescricao` — dados do contrato |
| `ebisfmedicaoassinatura` | `skmedicao` | Assinaturas; sempre filtrar `flactive = 'S'` |
| `ebisdfiscal` | `skfiscal` | Nome do fiscal por código |
| `ebisfmedicaocontratocalculo` | `skmedicao`, `sktipocalculomedicao` | Valores calculados; usar `sktipocalculomedicao = 5` (fallback: `1`) |

### Regras de SQL obrigatórias

```sql
-- ✅ Registros ativos (sempre)
WHERE tabela.flactive = 'S'

-- ✅ Flags booleanas com possível NULL — NUNCA use <> 'S'
WHERE flaprovada IS DISTINCT FROM 'S'

-- ✅ Valores numéricos pós LEFT JOIN
SELECT COALESCE(mc.vlmedicao, 0) AS valor

-- ✅ Parâmetros dinâmicos: validar em Python antes de interpolar
mid = int(skmedicao)  # ValueError se não for número inteiro
sql = f"SELECT ... WHERE skmedicao = {mid}"

-- ❌ NUNCA interpolar strings diretamente
# f"WHERE nome = '{nome}'"  ← SQL injection
```

### Template de join completo

```sql
SELECT
    c.cdtitulo              AS contrato,
    m.nutitulo              AS titulo_medicao,
    m.nuseqmedicaoh         AS sequencia,
    f.skmedicao,
    f.flaprovada,
    COALESCE(calc.vlcalculo, 0) AS valor
FROM ebisfmedicaocontrato f
JOIN ebisdcontrato c
    ON c.skcontrato = f.skcontrato
   AND c.flactive = 'S'
JOIN ebisdmedicaocontrato m
    ON m.skmedicao = f.skmedicao
   AND m.flactive = 'S'
LEFT JOIN ebisfmedicaocontratocalculo calc
    ON calc.skmedicao = f.skmedicao
   AND calc.sktipocalculomedicao = 5
   AND calc.flactive = 'S'
WHERE f.flactive = 'S'
ORDER BY c.cdtitulo, m.nuseqmedicaoh
```

---

## 8. Sistema de Permissões

```mermaid
flowchart TD
    Q["Usuário acessa relatório X?"] --> A{Qual é o papel?}
    A -->|admin ou publisher| B["✅ Acessa qualquer relatório published\n+ in_review"]
    A -->|viewer| C{Tem permissão para o relatório X?}
    C -->|"ReportPermission.user_id = usuário"| D["✅ Acesso direto"]
    C -->|"ReportPermission.group_id = grupo\ndo qual o usuário é membro"| E["✅ Acesso por grupo"]
    C -->|Nenhuma das anteriores| F["❌ Relatório não aparece na lista"]
```

### Gerenciar permissões via painel Admin

1. Admin → Relatórios → selecionar o relatório
2. Aba "Permissões" → adicionar usuário ou grupo
3. O usuário/membro do grupo passa a ver o relatório no portal

### Gerenciar grupos

1. Admin → Grupos → Criar grupo
2. Adicionar usuários ao grupo
3. Vincular o grupo ao relatório (mesma tela de permissões)

---

## 9. Variáveis de Ambiente

Arquivo: `backend/.env` (nunca commitar)

| Variável | Exemplo | Descrição |
|---|---|---|
| `SUPERSET_URL` | `https://sider.der.pe.gov.br/analytics` | URL base do Superset |
| `SUPERSET_USER` | `usuario_servico` | Usuário de serviço no Superset |
| `SUPERSET_PASSWORD` | `<secret>` | Senha do usuário de serviço |
| `SUPERSET_DATABASE_NAME` | `BI-PRO-CONSULTA` | Nome do banco no catálogo do Superset |
| `SUPERSET_SCHEMA` | `siderdwh` | Schema padrão para execução de queries |
| `SUPERSET_VERIFY_SSL` | `true` | Validar certificado SSL do Superset |
| `DATABASE_URL` | `postgresql+asyncpg://derpe:senha@postgres:5432/derpe_portal` | PostgreSQL local do portal |
| `REDIS_URL` | `redis://redis:6379` | Redis para cache |
| `CACHE_TTL` | `3600` | TTL do cache em segundos (padrão: 1 hora) |
| `JWT_SECRET` | `<openssl rand -base64 32>` | Segredo para assinar tokens JWT |
| `JWT_EXPIRE_HOURS` | `8` | Expiração do token em horas |
| `ADMIN_EMAIL` | `admin@der.pe.gov.br` | Email do admin criado no startup |
| `ADMIN_PASSWORD` | `<secret>` | Senha inicial do admin |
| `CORS_ORIGINS` | `http://localhost:8081` | Origens HTTP permitidas pelo CORS |
| `APP_ENV` | `development` | `development` ou `production` |

---

## 10. Deploy em Produção (OCI Free Tier)

### Pré-requisitos na instância

```bash
# 1. Instalar Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Abrir porta 80 no firewall do OS
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --reload
```

Abrir também a porta 80 no **Security List da VCN** da OCI (regra de entrada TCP).

### Configurar o ambiente

```bash
# Criar .env de produção
cp backend/.env.example backend/.env
nano backend/.env
```

Variáveis críticas para produção:

```env
POSTGRES_PASSWORD=<senha forte, mínimo 20 caracteres>
JWT_SECRET=<openssl rand -base64 32>
ADMIN_PASSWORD=<senha do admin>
SUPERSET_PASSWORD=<senha do usuário de serviço>
CORS_ORIGINS=http://<IP_PÚBLICO_OCI>
APP_ENV=production
```

### Deploy

```bash
# Primeira vez ou após mudanças de código
./deploy.sh

# Equivalente manual
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Verificar que subiu corretamente

```bash
docker compose ps
curl http://localhost/api/health          # → {"status": "ok"}
docker compose logs backend --tail=30
docker compose logs frontend --tail=10
```

### Tabela de comandos pós-deploy

| Tipo de mudança | Comando |
|---|---|
| Código Python ou `query.sql` | `docker compose restart backend` |
| Frontend React | Build dentro do contêiner ou CI/CD |
| Nova imagem Docker | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| Só `.env` | `docker compose restart backend` |
| Ver logs em tempo real | `docker compose logs backend -f` |

---

## 11. Usando IA no Projeto (Claude Code)

O projeto tem `CLAUDE.md` na raiz com todas as convenções — o Claude Code lê esse arquivo automaticamente ao iniciar uma sessão no diretório do projeto.

### O que o CLAUDE.md já cobre

- Stack completa e estrutura de pastas
- Convenções do DWH (`siderdwh`): tabelas, filtros, joins
- Regras do frontend: Tailwind, Lucide, ECharts, React Query
- Papéis de usuário e regras de acesso
- Comandos de deploy e restart

### Criar um agente especializado para o projeto

Para tarefas recorrentes (ex: sempre escrever queries DWH, ou sempre criar painéis seguindo o padrão), crie um arquivo de instruções dedicado em `.claude/agents/`.

**Exemplo — Agente para queries DWH:**

```markdown
<!-- .claude/agents/dwh-query.md -->
# Agente: Consultor DWH do DER-PE

Você é especialista em escrever queries SQL para o schema siderdwh do DER-PE.

## Regras obrigatórias
- Sempre filtrar `flactive = 'S'` em tabelas que tenham essa coluna
- Usar `IS DISTINCT FROM 'S'` para flags booleanas (nunca `<> 'S'`)
- `COALESCE(coluna, 0)` em valores numéricos de LEFT JOIN
- Validar parâmetros em Python antes de interpolar no SQL
- Limite de 50k linhas por query (limitação do Superset)
- O portal NUNCA escreve no DWH — somente SELECT

## Tabelas disponíveis
[copiar a seção de tabelas do CLAUDE.md]
```

**Exemplo — Agente para criar painéis:**

```markdown
<!-- .claude/agents/novo-painel.md -->
# Agente: Criador de Painéis do DER-PE

Você cria componentes React para o Portal BI do DER-PE.

## Localização dos arquivos
- Componente: frontend/src/reports/<slug>/index.tsx
- Thumbnail: frontend/src/reports/<slug>/Thumbnail.tsx
- Registro: automático via import.meta.glob (não editar registry.ts)

## Convenções obrigatórias
- Exportar função nomeada `Panel` (não default export)
- Exportar função nomeada `Thumbnail` no arquivo Thumbnail.tsx
- Props: `{ data: Row[] }` onde Row é interface tipada das colunas da query
- Somente Tailwind CSS — nenhum CSS avulso
- Somente ícones Lucide (`lucide-react`)
- EChart via componente `../../components/EChart` (não import direto do echarts)
- Cores: `text-gov-blue`, `bg-gov-blue`, `text-gov-yellow`

## Não fazer
- Não adicionar dependências ao package.json
- Não usar axios diretamente — dados chegam via props
- Não criar estado global — somente useState/useMemo locais
```

### Dicas para prompts mais eficazes

| Situação | O que incluir no prompt |
|---|---|
| Criar painel | Lista exata das colunas da query (nome + tipo + exemplos) |
| Visual complexo | Descrever cada seção (KPIs, gráficos, tabelas) separadamente |
| Gráfico ECharts | Especificar tipo (barras, linha, pizza) + o que vai nos eixos |
| Filtros | Descrever as colunas que serão filtráveis e o comportamento |
| Painel similar existente | Referenciar: "semelhante ao FluxoMedicoes, mas..." |

### Validação após geração com IA

```bash
# TypeScript não mente — sempre rodar antes de marcar como pronto
cd frontend && npx vite build

# Verificar que o painel aparece
# Acesse http://localhost:8081/relatorio/<slug>
```

---

## 12. Referência Rápida de Comandos

```bash
# ── Ambiente ──────────────────────────────────────────────────────────────────
docker compose up -d                          # Subir tudo
docker compose restart backend                # Após mudar Python ou query.sql
docker compose logs backend --tail=50         # Ver logs do backend
docker compose logs backend -f                # Seguir logs em tempo real
docker compose ps                             # Status dos contêineres

# ── Frontend ──────────────────────────────────────────────────────────────────
cd frontend && npx vite build                 # Build após qualquer mudança React

# ── Banco de dados ────────────────────────────────────────────────────────────
docker compose exec backend alembic upgrade head    # Aplicar migrations
docker compose exec backend alembic revision --autogenerate -m "descricao"  # Nova migration

# ── Deploy em produção ────────────────────────────────────────────────────────
./deploy.sh                                   # Build + up em produção
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
