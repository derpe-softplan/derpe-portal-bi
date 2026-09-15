from pathlib import Path

from app.reports import CATALOG


def test_catalog_loads_report_sql():
    current_dir = Path(__file__).resolve().parents[1]
    report_sql_path = current_dir / "app" / "reports" / "fluxo-medicoes-completa" / "query.sql"
    expected_sql = report_sql_path.read_text(encoding="utf-8")

    assert CATALOG[0].sql == expected_sql
