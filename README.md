# Portal BI — DER-PE

Portal de Business Intelligence interno do Departamento de Estradas de Rodagem de Pernambuco. Centraliza relatórios e painéis de acompanhamento de contratos, medições e pagamentos, consumindo dados do DWH via Apache Superset.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy async · Alembic |
| Banco local | PostgreSQL 16 |
| Cache | Redis 7 |
| DWH | Apache Superset SQL API |
| Frontend | React 18 · Vite · TypeScript · TanStack Query · Tailwind CSS |
| Infra | Docker Compose · nginx |

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2.20
- [Node.js](https://nodejs.org/) >= 20 (apenas para desenvolvimento frontend sem Docker)
- [Python](https://www.python.org/) >= 3.12 (apenas para desenvolvimento backend sem Docker)

## Setup de desenvolvimento

### 1. Variáveis de ambiente

```bash
cp .env.example backend/.env
```

Edite `backend/.env` e preencha as variáveis obrigatórias:

| Variável | Descrição |
|---|---|
| `SUPERSET_PASSWORD` | Senha do usuário de serviço no Superset |
| `POSTGRES_PASSWORD` | Qualquer senha para uso local |
| `JWT_SECRET` | Gere com `openssl rand -base64 32` |
| `ADMIN_PASSWORD` | Senha do usuário admin inicial |
| `CORS_ORIGINS` | `http://localhost:8080` para dev |
| `APP_ENV` | `development` para dev local |

### 2. Subir o ambiente

```bash
docker compose up -d
```

Serviços disponíveis:

| Serviço | URL |
|---|---|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:8080/api |
| API Docs (Swagger) | http://localhost:8080/api/docs |
| PostgreSQL | localhost:5432 |

### 3. Build do frontend (hot-reload alternativo)

```bash
cd frontend
npm install
npm run dev        # servidor Vite na porta 5173
```

## Estrutura do projeto

```
portal/
├── backend/
│   └── app/
│       ├── auth/          # Login, JWT, dependências de autenticação
│       ├── admin/         # CRUD de usuários, grupos, relatórios, permissões
│       ├── portal/        # Endpoints públicos (relatórios, medições, cronograma)
│       ├── reports/       # Catálogo de relatórios (meta.json + query.sql por slug)
│       ├── db/            # Models, session, migrations (Alembic)
│       ├── superset/      # Client async para o DWH via Superset SQL API
│       └── config.py      # Configurações via .env (Pydantic Settings)
└── frontend/
    └── src/
        ├── panels/        # Painéis customizados (ex.: FluxoMedicoes)
        ├── reports/       # Página de relatório por slug
        ├── services/api.ts # Toda a camada HTTP (axios + tipos TypeScript)
        ├── layouts/       # PortalLayout
        ├── pages/         # Páginas do React Router
        └── context/       # AuthContext
```

## Usuários e papéis

| Role | Acesso |
|---|---|
| `admin` | Tudo (portal + admin + relatórios em revisão) |
| `publisher` | Portal + admin (sem gerenciar usuários/grupos) |
| `viewer` | Apenas relatórios publicados com permissão |

O usuário admin inicial é criado automaticamente na primeira execução com as credenciais definidas em `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## Comandos úteis

```bash
# Subir todo o ambiente
docker compose up -d

# Ver logs do backend
docker compose logs backend --tail=50 -f

# Reiniciar backend (necessário após editar Python ou query.sql)
docker compose restart backend

# Build do frontend para produção
cd frontend && npx vite build

# Rodar testes do backend
cd backend && pytest

# Lint do backend
cd backend && ruff check .

# Lint do frontend
cd frontend && npm run lint
```

## Deploy em produção

O deploy é automático via GitHub Actions a cada push na branch `main`:

1. Imagens Docker são buildadas e publicadas no GHCR
2. O servidor OCI puxa as novas imagens e reinicia os serviços

### Configuração inicial do servidor

Consulte o `docker-compose.prod.yml` e certifique-se de que o arquivo `.env` de produção existe em `~/portal/.env` no servidor com as variáveis obrigatórias:

```
POSTGRES_PASSWORD=<senha forte>
JWT_SECRET=<openssl rand -base64 32>
ADMIN_PASSWORD=<senha do admin>
SUPERSET_PASSWORD=<senha do Superset>
CORS_ORIGINS=http://<IP_SERVIDOR>
APP_ENV=development   # até configurar HTTPS
```

### Secrets do GitHub Actions necessários

| Secret | Valor |
|---|---|
| `OCI_HOST` | IP do servidor |
| `OCI_USER` | Usuário SSH (ex.: `ubuntu`) |
| `OCI_SSH_KEY` | Conteúdo da chave privada SSH |

## Desenvolvimento de novos relatórios

1. Crie um diretório `backend/app/reports/<slug>/`
2. Adicione `meta.json` com `title` e `description`
3. Adicione `query.sql` com a query ao DWH (schema `siderdwh`)
4. Reinicie o backend: `docker compose restart backend`
5. Acesse Admin → Relatórios para publicar e agendar atualização

Consulte o `CLAUDE.md` para diretrizes completas de desenvolvimento.
