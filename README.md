# Portal BI — DER-PE

Portal de Business Intelligence interno do Departamento de Estradas de Rodagem de Pernambuco. Centraliza relatórios e painéis de acompanhamento de contratos, medições e pagamentos, consumindo dados do DWH via Apache Superset.

**Stack:** Python 3.12 · FastAPI · React 18 · TypeScript · PostgreSQL · Redis · Docker Compose

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/OVERVIEW.md`](docs/OVERVIEW.md) | Visão geral do sistema: de onde vêm os dados, arquitetura, fluxos e hospedagem — sem precisar ler código |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | Guia completo para desenvolvedores: como rodar, adicionar relatórios, criar painéis (com ou sem IA), convenções e deploy |
| [`CLAUDE.md`](CLAUDE.md) | Diretrizes do projeto para o agente de IA (Claude Code) |

---

## Setup rápido

```bash
# 1. Copiar e preencher variáveis de ambiente
cp backend/.env.example backend/.env

# 2. Subir os serviços
docker compose up -d

# 3. Build do frontend
cd frontend && npx vite build
```

Acesse em: `http://localhost:8081`

As variáveis obrigatórias e instruções detalhadas estão em [`docs/DEVELOPER.md`](docs/DEVELOPER.md).
