"""
Catálogo de relatórios do Portal BI.

Para adicionar um novo relatório, crie uma pasta em backend/app/reports/<slug>/
contendo:
  - meta.json  → { "title": "...", "description": "..." }
  - query.sql  → consulta SQL do relatório
"""

import json
from dataclasses import dataclass
from pathlib import Path

_REPORTS_DIR = Path(__file__).resolve().parent


@dataclass
class ReportSpec:
    title: str
    description: str
    slug: str
    sql: str
    refresh_schedule: str | None = None
    tipos: list[str] | None = None


def _build_catalog() -> list[ReportSpec]:
    catalog = []
    for section_dir in sorted(_REPORTS_DIR.iterdir()):
        if not section_dir.is_dir() or section_dir.name.startswith("_"):
            continue
        for report_dir in sorted(section_dir.iterdir()):
            if not report_dir.is_dir():
                continue
            meta_path = report_dir / "meta.json"
            query_path = report_dir / "query.sql"
            if not meta_path.exists() or not query_path.exists():
                continue
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            tipos = meta.get("tipos")
            if tipos is None and section_dir.name == "extracoes":
                tipos = ["Extração"]
            catalog.append(ReportSpec(
                title=meta["title"],
                description=meta.get("description", ""),
                slug=report_dir.name,
                sql=query_path.read_text(encoding="utf-8"),
                refresh_schedule=meta.get("refresh_schedule"),
                tipos=tipos,
            ))
    return catalog


CATALOG: list[ReportSpec] = _build_catalog()
