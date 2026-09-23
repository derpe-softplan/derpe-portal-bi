# Portal BI do DER-PE — Visão Geral do Sistema

**Público-alvo:** Qualquer pessoa nova na equipe que precisa entender como o sistema funciona, de onde vêm os dados e onde tudo está hospedado — sem precisar ler código.

> **Contexto:** Somos da Softplan, empresa de software responsável pelo SIDER, prestando suporte e BI ao **DER-PE** (Departamento de Estradas de Rodagem de Pernambuco). Este documento é escrito para a equipe Softplan envolvida nesse contrato.

---

## 1. O que é o Portal BI

O **Portal BI** é uma aplicação web desenvolvida para o **DER-PE** que consolida todos os relatórios e painéis de dados provenientes do SIDER em um único lugar — sem licenciamento adicional, acessível de qualquer dispositivo (incluindo celular) e sem a necessidade de estar dentro do sistema.

Antes do portal, os usuários precisavam acessar o SIDER diretamente ou consultar relatórios no Superset — ferramenta técnica da Softplan, não pensada para uso operacional direto pelo cliente. O portal resolve isso: qualquer usuário do DER-PE com autorização da diretoria passa a ter acesso a uma interface simples e focada nos dados do seu setor.

A ideia é que o portal abranja **todos os módulos do SIDER** à medida que novas demandas surgirem — hoje o foco está em contratos e medições, mas a arquitetura não é limitada a isso.

**Quem usa:**
| Perfil | O que faz no portal |
|---|---|
| Usuários e gestores de setores do DER-PE | Consultam relatórios e painéis dos dados do SIDER pertinentes ao seu setor |
| Administradores (equipe Softplan/BI) | Gerenciam usuários, publicam relatórios, monitoram atualizações de dados |

---

## 2. De onde vêm os dados

Os dados percorrem quatro camadas antes de aparecerem no portal:

```mermaid
flowchart LR
    A[("SIDER\nSistema de Produção\nOracle")] -->|"ETL periódico\n(processo separado)"| B[("DWH\nsiderdwh\nPostgreSQL")]
    B --- C["Apache Superset\n(ambiente Softplan)"]
    C -->|"SQL API\n(HTTPS)"| D["Backend\nFastAPI"]
    D --> E["Portal\n(Navegador)"]
```

### SIDER — Sistema de Produção

O **SIDER** é o sistema ERP da Softplan utilizado pelo DER-PE para gestão de todos os seus processos — contratos, medições, patrimônio, financeiro e outros módulos. O banco de dados de produção é **Oracle**, hospedado no ambiente da Softplan. É a fonte primária de todos os dados que chegam ao portal.

### ETL — Extração e Carga no DWH

Um processo ETL (Extract, Transform, Load) roda periodicamente, extrai dados do banco Oracle do SIDER, aplica transformações e os carrega no DWH. Esse processo é **gerenciado em repositório separado** — qualquer problema com a origem dos dados ou colunas faltando começa aqui.

> O código do ETL está em repositório GitLab dedicado, mantido pela equipe de BI da Softplan.

### DWH — Data Warehouse (`siderdwh`)

O DWH é um banco **PostgreSQL** analítico com schema `siderdwh`, também no ambiente da Softplan. Organizado no modelo **fato-dimensão**:

| Prefixo | Tipo | Exemplo | Contém |
|---|---|---|---|
| `ebisf*` | Fato | `ebisfmedicaocontrato` | Dados transacionais, chaves (`sk*`), flags |
| `ebisd*` | Dimensão | `ebisdcontrato` | Atributos desnormalizados, descrições, títulos |

O portal **nunca escreve no DWH** — acesso é somente-leitura via Superset.

### Apache Superset — Gateway de Acesso ao DWH

O Superset é a ferramenta de BI da Softplan, publicada na web e acessível via usuário e senha. O DWH (`siderdwh`) está no mesmo ambiente da Softplan e só é acessível a partir daí — o portal não tem conexão direta com o PostgreSQL do DWH. Por isso, o backend autentica-se no Superset como usuário de serviço e envia queries SQL via a API interna (`POST /superset/sql_json/`), que executa no DWH e retorna os resultados.

> **Em desenvolvimento:** o acesso ao Superset requer estar na rede da Softplan (ou VPN), pois o DWH que o Superset consulta não é acessível de fora desse ambiente.

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

    subgraph SOFTPLAN["☁️ Ambiente Softplan"]
        SUPERSET["Apache Superset\n(web, acesso por usuário/senha)"]
        DWH[("DWH\nsiderdwh\nPostgreSQL")]
        SIDER[("SIDER\nProdução\nOracle")]
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

**Conectividade OCI ↔ Ambiente Softplan:**
- O backend conecta-se ao Superset via HTTPS — o Superset é acessível na web com usuário e senha
- O IP do Superset (`136.248.126.29`) é resolvido via `extra_hosts` no Docker Compose
- Em desenvolvimento, os contêineres usam os DNS internos da Softplan (`192.168.100.x`) para resolução de nomes do ambiente

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

    SIDER->>ETL: Dados dos módulos do SIDER<br/>(Oracle → ETL)
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
| DWH / Superset | Ambiente Softplan (acesso via VPN ou rede interna) | Idem — externo ao portal |

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
