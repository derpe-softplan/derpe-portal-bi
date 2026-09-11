"""
Catálogo de relatórios do Portal BI.

Para adicionar um novo painel:
  1. Crie uma pasta em backend/app/reports/<slug>/
  2. Coloque a SQL em query.sql
  3. Se necessário, ajuste metadados e slug abaixo.

Compatibilidade:
  - a estrutura antiga em backend/app/queries/*.sql ainda funciona como fallback.
"""

from dataclasses import dataclass
from pathlib import Path

_REPORTS_ROOT = Path(__file__).resolve().parent
_LEGACY_QUERIES = Path(__file__).resolve().parent.parent / "queries"


@dataclass
class ReportSpec:
    title: str
    description: str
    slug: str
    sql: str


def _load_legacy(filename: str, *, title: str, description: str, slug: str) -> ReportSpec:
    sql = (_LEGACY_QUERIES / filename).read_text(encoding="utf-8")
    return ReportSpec(title=title, description=description, slug=slug, sql=sql)


def _load_report_dir(report_dir: Path, *, title: str | None = None, description: str | None = None) -> ReportSpec:
    sql_path = report_dir / "query.sql"
    if not sql_path.exists():
        raise FileNotFoundError(f"Arquivo de SQL não encontrado para o relatório: {report_dir}")

    slug = report_dir.name.replace("_", "-")
    return ReportSpec(
        title=title or slug.replace("-", " ").title(),
        description=description or "Relatório do portal.",
        slug=slug,
        sql=sql_path.read_text(encoding="utf-8"),
    )


def _build_catalog() -> list[ReportSpec]:
    discovered: list[ReportSpec] = []
    for report_dir in sorted(_REPORTS_ROOT.iterdir()):
        if not report_dir.is_dir():
            continue
        query_sql = report_dir / "query.sql"
        if not query_sql.exists():
            continue

        metadata = {
            "fluxo_medicoes_completa": {
                "title": "Fluxo de Medições",
                "description": (
                    "Jornada completa da medição: criação, assinatura, "
                    "nota fiscal, liquidação e pagamento."
                ),
            }
        }
        report_meta = metadata.get(report_dir.name, {})
        discovered.append(
            _load_report_dir(
                report_dir,
                title=report_meta.get("title"),
                description=report_meta.get("description"),
            )
        )

    if discovered:
        return discovered

    return [
        _load_legacy(
            "fluxo_medicoes.sql",
            title="Fluxo de Medições",
            description=(
                "Jornada completa da medição: criação, assinatura, "
                "nota fiscal, liquidação e pagamento."
            ),
            slug="fluxo-medicoes-completa",
        )
    ]


CATALOG: list[ReportSpec] = _build_catalog()
