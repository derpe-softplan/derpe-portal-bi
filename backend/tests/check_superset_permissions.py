"""
Utilitário para verificar permissões por tabela no Superset DWH.

Uso:
    SUPERSET_USER=admin SUPERSET_PASSWORD=xxx python check_superset_permissions.py

Não é um teste pytest — é um script de diagnóstico manual.
"""
import os
import re
import random
import string
import warnings

import requests

warnings.filterwarnings("ignore")

BASE_URL = os.environ["SUPERSET_URL"]
USERNAME = os.environ["SUPERSET_USER"]
PASSWORD = os.environ["SUPERSET_PASSWORD"]
DB_ID = int(os.getenv("SUPERSET_DATABASE_ID", "1"))
SCHEMA = os.getenv("SUPERSET_SCHEMA", "siderdwh")

TABELAS = [
    "ebisfmedicaocontratohistorico",
    "ebisfmedicaocontratocalculo",
    "ebisfmedicaoassinatura",
    "ebisdfiscal",
    "ebisftrechorodoviaobracontrato",
    "ebisdrodovia",
    "ebisfaofdocumentomedicao",
    "ebisfaofempenholiquidacaoitem",
    "ebisfaofpagamentoitem",
    "ebisfsujeitocontrato",
    "ebisdsujeito",
    "ebisfmedicaocontrato",
    "ebisdmedicaocontrato",
    "ebisdsituacaomedicao",
    "ebisdcontrato",
    "ebisfcontrato",
    "ebisdnaturezacontrato",
    "ebisdorgaosetor",
    "ebisdtempo",
]


def short_id(n=10):
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))


def sep(t): print(f"\n{'='*60}\n  {t}\n{'='*60}")
def ok(m):  print(f"  [OK]  {m}")
def err(m): print(f"  [ERR] {m}")
def info(m): print(f"  [..]  {m}")


# ── Auth ──────────────────────────────────────────────────────────────────────
s = requests.Session()
s.verify = False
page = s.get(f"{BASE_URL}/login/", timeout=15)
m = re.search(r'csrf_token[^>]+value=["\']([^"\']+)', page.text)
s.post(
    f"{BASE_URL}/login/",
    data={"email": USERNAME, "password": PASSWORD, "csrf_token": m.group(1) if m else ""},
    allow_redirects=True,
    timeout=30,
)
jwt = s.post(
    f"{BASE_URL}/api/v1/security/login",
    json={"username": USERNAME, "password": PASSWORD, "provider": "db"},
    timeout=30,
).json()["access_token"]
csrf = s.get(
    f"{BASE_URL}/api/v1/security/csrf_token/",
    headers={"Authorization": f"Bearer {jwt}"},
    timeout=10,
).json().get("result", "")
H = {"Content-Type": "application/json", "X-CSRFToken": csrf}
ok("Auth OK")


def run(sql, schema=SCHEMA, limit=5):
    r = s.post(
        f"{BASE_URL}/superset/sql_json/",
        headers=H,
        json={
            "database_id": DB_ID,
            "schema": schema,
            "client_id": short_id(),
            "sql": sql,
            "queryLimit": limit,
            "runAsync": False,
            "select_as_cta": False,
        },
        timeout=30,
    )
    return r.json().get("data", []) if r.ok else None


# ── Permissões por tabela ─────────────────────────────────────────────────────
sep("PERMISSOES POR TABELA (siderdwh)")
checks = ", ".join(
    f"has_table_privilege('consultabipro', 'siderdwh.{t}', 'SELECT') AS {t[:30]}"
    for t in TABELAS
)
r = s.post(
    f"{BASE_URL}/superset/sql_json/",
    headers=H,
    json={
        "database_id": DB_ID,
        "schema": SCHEMA,
        "client_id": short_id(),
        "sql": f"SELECT {checks}",
        "queryLimit": 1,
        "runAsync": False,
        "select_as_cta": False,
    },
    timeout=30,
)
if r.ok:
    row = r.json().get("data", [{}])[0]
    sem_acesso = []
    for tabela, tem in row.items():
        print(f"  {'[OK]' if tem else '[SEM]'}  {tabela}")
        if not tem:
            sem_acesso.append(tabela)
    if sem_acesso:
        print(f"\n  Faltam grants em {len(sem_acesso)} tabelas:")
        for t in sem_acesso:
            print(f"    GRANT SELECT ON siderdwh.{t} TO consultabipro;")
    else:
        ok("Todas as tabelas têm SELECT!")
else:
    err(f"Verificação falhou: {r.text[:300]}")

print("\n" + "=" * 60 + "\n  CONCLUIDO\n" + "=" * 60)
