# DER-PE Portal BI — Diretrizes do Projeto

Este arquivo define os padrões e convenções do projeto. Leia-o integralmente antes de qualquer alteração.

---

## Visão geral

Portal BI interno da DER-PE (Departamento de Estradas de Rodagem de Pernambuco). Centraliza relatórios e painéis de acompanhamento de contratos, medições e pagamentos. Consome dados do DWH via Apache Superset.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 · FastAPI (async) · SQLAlchemy async · Alembic |
| Banco local | PostgreSQL (dados de usuários, grupos, snapshots) |
| Cache | Redis |
| DWH | Superset SQL API → schema `siderdwh` no banco de dados de produção |
| Frontend | React 18 · Vite · TypeScript · TanStack React Query · Tailwind CSS · Lucide icons |
| Infra | Docker Compose · nginx (arquivos estáticos do frontend) |

---

## Estrutura de pastas

```
portal/
├── backend/
│   └── app/
│       ├── auth/          # login, sessão, deps de autenticação
│       ├── admin/         # router.py — CRUD de usuários, grupos, relatórios, permissões
│       ├── portal/        # router.py — endpoints públicos (portal, medições, cronograma)
│       ├── reports/       # catálogo de relatórios (um diretório por relatório)
│       │   └── <slug>/
│       │       ├── meta.json   # title, description, refresh_schedule
│       │       └── query.sql   # SQL que gera o snapshot
│       ├── db/            # models.py, session.py, migrations
│       ├── superset/      # client.py — acesso ao DWH via Superset SQL API
│       ├── config.py      # settings via .env
│       └── main.py        # startup, lifespan, routers
└── frontend/
    └── src/
        ├── panels/        # painéis customizados (ex.: FluxoMedicoes)
        ├── reports/       # páginas de relatório por slug
        ├── services/
        │   └── api.ts     # toda a camada HTTP (axios + tipos TypeScript)
        ├── layouts/       # PortalLayout, AdminLayout
        ├── pages/         # páginas do React Router
        └── context/       # AuthContext
```

---

## Sistema de relatórios (snapshot)

1. Cada relatório tem um diretório `backend/app/reports/<slug>/` com `meta.json` e `query.sql`.
2. O catálogo (`CATALOG`) é construído **uma única vez na inicialização** do backend via `_build_catalog()` em `reports/__init__.py`.
3. O `main.py` sincroniza o catálogo com a tabela `reports` do PostgreSQL no startup.
4. O snapshot (resultado da query) é armazenado em `report_snapshots` e servido pelo endpoint `GET /portal/reports/{slug}/data`.
5. Atualização dos dados: Admin → Relatórios → "Atualizar dados" (ou schedule automático).

**Regra crítica:** qualquer alteração em `query.sql` ou em arquivos Python exige `docker compose restart backend` — o catálogo não é recarregado em hot-reload.

---

## Queries ao vivo (não-snapshot)

Consultas que precisam de parâmetros dinâmicos (ex.: detalhe de uma medição específica) são implementadas diretamente em `backend/app/portal/router.py` como endpoints FastAPI, usando `get_client().query(sql)` do módulo `app.superset.client`.

Padrão: validar o parâmetro em Python antes de interpolar no SQL (ex.: `int(skmedicao)` para garantir que é inteiro antes de usar `{mid}` no f-string).

---

## Convenções do DWH (`siderdwh`)

- **Tabelas fato** (`ebisf*`): dados transacionais. Ex.: `ebisfmedicaocontrato`, `ebisfmedicaoassinatura`.
- **Tabelas dimensão** (`ebisd*`): desnormalizadas, contêm atributos de entidades. Ex.: `ebisdmedicaocontrato` (tem `nutitulo`, `nuseqmedicaoh`), `ebisdcontrato`.
- Filtro padrão de registros ativos: `flactive = 'S'`.
- Usar `IS DISTINCT FROM 'S'` em vez de `<> 'S'` para cobrir NULLs (ex.: `flaprovada IS DISTINCT FROM 'S'`).
- Usar `COALESCE(coluna, 0)` em comparações numéricas que possam vir de LEFT JOIN com miss.

### Tabelas relevantes para medições

| Tabela | Tipo | Uso |
|---|---|---|
| `ebisfmedicaocontrato` | Fato | Base principal; tem `skmedicao`, `skcontrato`, `flaprovada` |
| `ebisdmedicaocontrato` | Dimensão | Tem `nutitulo`, `nuseqmedicaoh` por `skmedicao` |
| `ebisdcontrato` | Dimensão | Tem `cdtitulo`, `skcontrato` |
| `ebisfmedicaoassinatura` | Fato | Assinaturas; join em `skmedicao`, filtrar `flactive = 'S'` |
| `ebisdfiscal` | Dimensão | Nome do fiscal por `skfiscal` |
| `ebisfmedicaocontratocalculo` | Fato | Valores calculados; usar `sktipocalculomedicao = 5` (fallback: `1`) |

---

## Frontend

### Fluxo de build

```bash
cd frontend
npx vite build        # gera dist/ — nginx serve daqui
# depois: Ctrl+Shift+R no browser para limpar cache do JS
```

### Convenções

- API centralizada em `frontend/src/services/api.ts` — **não** usar axios diretamente nos componentes.
- TanStack React Query para cache/fetch: `queryKey` deve incluir todos os parâmetros que afetam o resultado.
- Tailwind CSS para estilização; não criar CSS avulso.
- Ícones: Lucide icons (`lucide-react`) — não adicionar outras libs de ícones.
- Cores de governo: classes `bg-gov-blue`, `bg-gov-blue-dark`, `text-gov-yellow` (definidas no `tailwind.config`).
- Etapas da jornada de medição têm ordem fixa em `ETAPAS_ORDER`; nunca reordenar sem atualizar o array.

---

## Papéis de usuário

| Role | Acesso |
|---|---|
| `admin` | Tudo (portal + admin + pode ver relatórios em `in_review`) |
| `publisher` | Portal + admin (sem gerenciar usuários/grupos) |
| `viewer` | Apenas relatórios publicados aos quais tem permissão |

---

## Variáveis de ambiente

Definidas em `.env` na raiz de `backend/`. Nunca commitar `.env`. Principais:

- `SUPERSET_URL`, `SUPERSET_USER`, `SUPERSET_PASSWORD`, `SUPERSET_DATABASE_NAME`, `SUPERSET_SCHEMA`
- `DATABASE_URL` (PostgreSQL local)
- `REDIS_URL`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

---

## Deploy em produção (OCI Free Tier)

O arquivo `docker-compose.prod.yml` sobrepõe o compose de dev para produção:
- Remove os volume mounts de código local (usa as imagens buildadas)
- Expõe a porta 80 em vez de 8081
- Remove os DNS internos da DER-PE (usa 8.8.8.8 + `extra_hosts` para o DWH)

### Pré-requisitos na instância OCI
1. Docker instalado (`curl -fsSL https://get.docker.com | sudo sh`)
2. Portas 80 e 443 abertas no Security List da VCN **e** no firewall do OS
3. Arquivo `.env` criado na raiz do projeto (copiar de `.env.example` e preencher)

### Variáveis obrigatórias no `.env` de produção
```
POSTGRES_PASSWORD=<senha forte>
JWT_SECRET=<openssl rand -base64 32>
ADMIN_PASSWORD=<senha do admin>
SUPERSET_PASSWORD=<senha do usuário do Superset>
CORS_ORIGINS=http://<IP_OCI>
```

### Deploy inicial e atualizações
```bash
# Primeira vez ou após mudanças no código/SQL
./deploy.sh

# Equivalente manual
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Após atualizar apenas SQL ou Python (sem mudança de imagem)
```bash
docker compose restart backend
```

### Logs em produção
```bash
docker compose logs backend -f
docker compose logs frontend -f
```

---

## Comandos úteis

```bash
# Subir todo o ambiente
docker compose up -d

# Reiniciar apenas o backend (necessário após editar Python ou query.sql)
docker compose restart backend

# Ver logs do backend
docker compose logs backend --tail=50

# Build do frontend
cd frontend && npx vite build
```

---

## O que NÃO fazer

- Não alterar a query de assinaturas sem validar no Superset primeiro — a estrutura correta parte de `ebisfmedicaoassinatura` como tabela base, com joins em `ebisdcontrato` (via `skcontrato`), `ebisdmedicaocontrato` (via `skmedicao`) e `ebisdfiscal`.
- Não editar `query.sql` e esquecer de reiniciar o backend.
- Não adicionar lógica de negócio diretamente nos componentes React — lógica de dados fica em hooks ou no `mapSnapshot`.
- Não criar endpoints de snapshot para dados que precisam de parâmetro dinâmico — use query ao vivo no `portal/router.py`.
- Não commitar arquivos de `dist/` ou `__pycache__/`.
