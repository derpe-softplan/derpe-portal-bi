# Portal BI DER-PE — Visão Geral do Sistema

**Público-alvo:** Qualquer pessoa nova na equipe que precisa entender como o sistema funciona, de onde vêm os dados e onde tudo está hospedado — sem precisar ler código.

---

## 1. O que é o Portal BI

O **Portal BI** é uma aplicação web interna da **DER-PE** (Departamento de Estradas de Rodagem de Pernambuco) que centraliza relatórios e painéis de acompanhamento de **contratos, medições e pagamentos** de obras rodoviárias.

Antes do portal, informações sobre o andamento de medições precisavam ser extraídas manualmente do sistema de gestão ou consultadas diretamente no banco de dados — processo lento e sujeito a erros. O portal automatiza esse ciclo: coleta dados do sistema de produção, armazena snapshots otimizados e os exibe em painéis interativos.

**Quem usa:**
| Perfil | O que faz no portal |
|---|---|
| Gestores de contrato | Acompanham andamento de medições e pagamentos |
| Fiscais de campo | Consultam status de assinaturas e etapas da jornada |
| Administradores | Gerenciam usuários, publicam relatórios, monitoram atualizações |

---

## 2. De onde vêm os dados

Os dados percorrem quatro camadas antes de aparecerem no portal:

```mermaid
flowchart LR
    A[("SIDER\nSistema de Produção\nPostgreSQL")] -->|"ETL periódico\n(processo separado)"| B[("DWH\nsiderdwh\nPostgreSQL")]
    B --- C["Apache Superset\nsider.der.pe.gov.br/analytics"]
    C -->|"SQL API\n(HTTPS)"| D["Backend\nFastAPI"]
    D --> E["Portal\n(Navegador)"]
```

### SIDER — Sistema de Produção

O **SIDER** é o sistema de gestão operacional da DER-PE. É onde tudo nasce: contratos firmados, medições lançadas, assinaturas registradas, notas fiscais emitidas. Roda em banco PostgreSQL dentro da rede interna da DER-PE.

### ETL — Extração e Carga no DWH

Um processo ETL (Extract, Transform, Load) roda periodicamente e extrai dados do SIDER, aplica transformações e os carrega no DWH (Data Warehouse). Esse processo é **gerenciado em repositório separado** — qualquer problema com a origem dos dados ou com colunas faltando começa aqui.

> O código do ETL está em repositório GitLab dedicado, mantido pela equipe de BI da Softplan.

### DWH — Data Warehouse (`siderdwh`)

O DWH é um banco PostgreSQL analítico com schema `siderdwh`. Organizado no modelo **fato-dimensão**:

| Prefixo | Tipo | Exemplo | Contém |
|---|---|---|---|
| `ebisf*` | Fato | `ebisfmedicaocontrato` | Dados transacionais, chaves (`sk*`), flags |
| `ebisd*` | Dimensão | `ebisdcontrato` | Atributos desnormalizados, descrições, títulos |

O portal **nunca escreve no DWH** — acesso é somente-leitura via Superset.

### Apache Superset — Gateway de Acesso ao DWH

O [Superset](https://sider.der.pe.gov.br/analytics) é a ferramenta de BI da DER-PE que o portal usa como **gateway** para o DWH. O backend autentica-se no Superset como usuário de serviço e envia queries SQL via a API interna do Superset (`POST /superset/sql_json/`).

> **Por que usar o Superset como intermediário?** O banco do DWH só é acessível através do Superset dentro da infraestrutura da DER-PE. O portal não tem acesso direto ao PostgreSQL do DWH — essa camada de indireção é intencional.

---

## 3. Arquitetura do Sistema

```mermaid
graph TB
    USER(["Navegador\ndo Usuário"])

    subgraph OCI["☁️ OCI Free Tier — VM ARM pública"]
        NGINX["nginx\n(porta 80)\n• Serve arquivos React\n• Faz proxy de /api → backend"]
        FASTAPI["Backend FastAPI\n(Python 3.12)\nporta 8000 interna"]
        POSTGRES[("PostgreSQL 16\n• Usuários e grupos\n• Relatórios e permissões\n• Snapshots de dados")]
        REDIS[("Redis 7\nCache de queries\ndo DWH")]
    end

    subgraph DERPE["🏢 Rede Interna DER-PE"]
        SUPERSET["Apache Superset\nsider.der.pe.gov.br/analytics"]
        DWH[("DWH\nsiderdwh")]
        SIDER[("SIDER\nProdução")]
        ETL["Processo ETL"]
    end

    USER -->|"HTTP porta 80"| NGINX
    NGINX -->|"arquivos estáticos"| USER
    NGINX -->|"proxy /api"| FASTAPI
    FASTAPI <-->|"SQLAlchemy async"| POSTGRES
    FASTAPI <-->|"cache TTL 1h"| REDIS
    FASTAPI -->|"HTTPS + autenticação"| SUPERSET
    SUPERSET <--> DWH
    SIDER -->|"carga periódica"| ETL
    ETL --> DWH
```

**Conectividade OCI ↔ DER-PE:**
- O backend conecta-se ao Superset via HTTPS pela internet pública
- O IP do Superset (`136.248.126.29`) é resolvido via `extra_hosts` no Docker Compose
- Em desenvolvimento, os DNS internos da DER-PE (`192.168.100.x`) são configurados nos contêineres para resolução de nomes internos

---

## 4. Fluxo de Dados Ponta a Ponta

### 4.1 Atualização dos dados (como os dados chegam ao portal)

```mermaid
sequenceDiagram
    participant SIDER as SIDER (Produção)
    participant ETL as Processo ETL
    participant DWH as DWH siderdwh
    participant Superset as Apache Superset
    participant Backend as Backend FastAPI
    participant Snapshot as report_snapshots (PostgreSQL)

    SIDER->>ETL: Dados de contratos,<br/>medições, assinaturas
    ETL->>DWH: INSERT/UPDATE — carga periódica

    Note over Backend,Snapshot: Acionado por scheduler automático ou Admin manualmente

    Backend->>Superset: POST /superset/sql_json/<br/>(query.sql do relatório)
    Superset->>DWH: Executa SQL em siderdwh
    DWH-->>Superset: Resultado (até 50k linhas)
    Superset-->>Backend: JSON com as linhas
    Backend->>Snapshot: Salva JSON em report_snapshots
    Backend->>Backend: Registra em refresh_logs
```

### 4.2 Consulta pelo usuário (como o usuário vê os dados)

```mermaid
sequenceDiagram
    actor Usuário
    participant React as Frontend React
    participant FastAPI as Backend FastAPI
    participant Postgres as PostgreSQL (portal)

    Usuário->>React: Abre /relatorio/fluxo-medicoes
    React->>FastAPI: GET /api/portal/reports/fluxo-medicoes/data
    FastAPI->>FastAPI: Valida JWT no cookie
    FastAPI->>FastAPI: Verifica permissão do usuário
    FastAPI->>Postgres: SELECT data FROM report_snapshots
    Postgres-->>FastAPI: JSON com o snapshot
    FastAPI-->>React: {data: [...linhas], refreshed_at: "..."}
    React->>React: mapSnapshot() transforma linhas em props
    React-->>Usuário: Painel renderizado (gráficos, KPIs, tabelas)
```

> O snapshot elimina latência: o usuário recebe dados do **PostgreSQL local** (milissegundos), não do DWH externo. O DWH só é consultado durante a atualização periódica, não a cada visita.

### 4.3 Query ao vivo (dados com parâmetros dinâmicos)

Para dados que **precisam de parâmetros** (ex: assinaturas de uma medição específica), o backend consulta o Superset em tempo real — sem snapshot intermediário.

```mermaid
sequenceDiagram
    actor Usuário
    participant React as Frontend React
    participant FastAPI as Backend FastAPI
    participant Redis as Redis (cache)
    participant Superset as Apache Superset

    Usuário->>React: Expande detalhe da medição #1234
    React->>FastAPI: GET /api/portal/medicoes/1234/assinaturas
    FastAPI->>Redis: Verifica cache (chave = MD5 do SQL)
    alt Cache hit
        Redis-->>FastAPI: Resultado em cache
    else Cache miss
        FastAPI->>Superset: POST /superset/sql_json/ com skmedicao=1234
        Superset-->>FastAPI: Lista de assinaturas
        FastAPI->>Redis: Armazena com TTL=1h
    end
    FastAPI-->>React: Lista de assinaturas
    React-->>Usuário: Renderiza assinaturas da medição
```

---

## 5. Onde Está Hospedado

| Componente | Desenvolvimento | Produção |
|---|---|---|
| Toda a aplicação | Docker Compose local | OCI Free Tier — VM ARM |
| Acesso externo | `localhost:8081` | IP público da OCI, porta 80 |
| Frontend (React) | Build em `dist/` servido por nginx | Idem |
| Backend (FastAPI) | Porta 8000 (interna) | Idem |
| PostgreSQL | Porta 5432 (interna) | Idem, volume persistente |
| Redis | Porta 6379 (interna) | Idem |
| DWH / Superset | `sider.der.pe.gov.br` (rede DER-PE) | Idem — externo ao portal |

**OCI Free Tier:**
- Instância ARM Ampere A1 — **4 OCPUs e 24 GB de RAM gratuitos**
- Toda a aplicação roda via Docker Compose com arquivo de override (`docker-compose.prod.yml`)
- Em produção não há volume de código local — a imagem buildada é usada diretamente

---

## 6. Fluxo de Autenticação

```mermaid
sequenceDiagram
    actor Usuário
    participant Frontend as Frontend React
    participant FastAPI as Backend FastAPI
    participant PostgreSQL

    Usuário->>Frontend: Digita usuário e senha
    Frontend->>FastAPI: POST /api/auth/login
    FastAPI->>PostgreSQL: SELECT user WHERE username = ?
    PostgreSQL-->>FastAPI: Registro do usuário (com hash bcrypt)
    FastAPI->>FastAPI: bcrypt.verify(senha, hash)
    FastAPI->>FastAPI: Gera JWT {user_id, email, role}<br/>Expiração: 8 horas
    FastAPI-->>Frontend: Set-Cookie: access_token<br/>(httpOnly, SameSite=Lax)

    Note over Frontend,FastAPI: Toda requisição subsequente

    Frontend->>FastAPI: GET /api/portal/... (cookie enviado automaticamente)
    FastAPI->>FastAPI: Decodifica JWT do cookie
    FastAPI->>FastAPI: Verifica expiração e papel (role)
    FastAPI-->>Frontend: Resposta autorizada
```

**Segurança do token:**
- Cookie `httpOnly` — JavaScript no browser não consegue ler o token (proteção contra XSS)
- `SameSite=Lax` — protege contra CSRF
- Em caso de 401, o frontend redireciona automaticamente para `/login`
- Senha inicial marcada com `must_change_password=true` — usuário é forçado a trocar antes de acessar o portal

---

## 7. Papéis de Usuário

```mermaid
graph LR
    A["👑 admin"] -->|"inclui tudo de"| B["📝 publisher"]
    B -->|"inclui tudo de"| C["👁 viewer"]

    A --- D["Gerenciar usuários e grupos\nVer relatórios in_review"]
    B --- E["Criar, editar e publicar relatórios\nAtualizar snapshots"]
    C --- F["Ver relatórios publicados\ncom permissão explícita"]
```

| Papel | Acesso ao portal | Painel admin | Gerenciar usuários | Ver rascunhos |
|---|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `publisher` | ✅ | ✅ (parcial) | ❌ | ✅ |
| `viewer` | ✅ (limitado) | ❌ | ❌ | ❌ |

**Permissão por relatório:**
- Um `viewer` só vê relatórios para os quais tem permissão explícita — por usuário individual ou por pertencer a um grupo com acesso.
- `admin` e `publisher` veem todos os relatórios publicados automaticamente.

---

## 8. Ciclo de Vida de um Relatório

```mermaid
stateDiagram-v2
    direction LR
    [*] --> draft : Admin/Publisher cria\nno painel Admin
    draft --> in_review : Envia para revisão
    in_review --> published : Aprovado\n(aparece no portal)
    in_review --> draft : Correção solicitada
    published --> archived : Desativado
    archived --> published : Reativado

    note right of published
        Visível para todos os
        viewers com permissão
    end note

    note right of in_review
        Admins e publishers
        podem visualizar para
        validação
    end note
```

**Etapas resumidas:**
1. **draft** — Relatório criado, configurado com título, capa, SQL query e permissões
2. **in_review** — Enviado para revisão; admins e publishers validam os dados
3. **published** — Disponível no portal para os viewers autorizados
4. **archived** — Desativado; não aparece no portal mas os dados são preservados

---

## 9. Componentes Internos do Backend

```mermaid
graph TB
    subgraph Startup["Startup (lifespan)"]
        A["Cria usuário admin\n(se não existir)"]
        B["Sincroniza catálogo de\nrelatórios com PostgreSQL"]
        C["Inicia scheduler\n(APScheduler)"]
        D["Inicializa SupersetClient\n(autentica no Superset)"]
        E["Conecta ao Redis"]
    end

    subgraph Routers["Routers FastAPI"]
        R1["/api/auth\nLogin, logout, perfil"]
        R2["/api/admin\nCRUD usuários, grupos,\nrelatórios, permissões"]
        R3["/api/portal\nRelatórios publicados,\nqueries ao vivo"]
    end

    subgraph Infra["Infraestrutura"]
        SC["SupersetClient\nAutenticação + execução\nde queries no DWH"]
        RD["Redis\nCache de queries\nTTL configurável"]
        PG["PostgreSQL\nDados do portal"]
    end

    Startup --> Routers
    R3 --> SC
    SC --> RD
    R1 & R2 & R3 --> PG
```
