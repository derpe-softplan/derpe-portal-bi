"""
Verificacao de permissoes por tabela — py -X utf8 test_superset.py
"""
import re, random, string, warnings
import requests
warnings.filterwarnings("ignore")

BASE_URL  = "https://sider.der.pe.gov.br/analytics"
USERNAME  = "admin"
PASSWORD  = "x6vY0SeJTxo2f34KL1Mb"
DB_ID     = 1
SCHEMA    = "siderdwh"
SQL_PATH  = r"backend\app\reports\fluxo_medicoes_completa\query.sql"

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
    return ''.join(random.choices(string.ascii_letters + string.digits, k=n))

def sep(t): print(f"\n{'='*60}\n  {t}\n{'='*60}")
def ok(m):  print(f"  [OK]  {m}")
def err(m): print(f"  [ERR] {m}")
def info(m):print(f"  [..]  {m}")

# ── Auth ──────────────────────────────────────────────────
s = requests.Session()
s.verify = False
page = s.get(f"{BASE_URL}/login/", timeout=15)
m = re.search(r'csrf_token[^>]+value=["\']([^"\']+)', page.text)
s.post(f"{BASE_URL}/login/",
       data={"email": USERNAME, "password": PASSWORD, "csrf_token": m.group(1) if m else ""},
       allow_redirects=True, timeout=30)
jwt = s.post(f"{BASE_URL}/api/v1/security/login",
             json={"username": USERNAME, "password": PASSWORD, "provider": "db"},
             timeout=30).json()["access_token"]
csrf = s.get(f"{BASE_URL}/api/v1/security/csrf_token/",
             headers={"Authorization": f"Bearer {jwt}"}, timeout=10).json().get("result", "")
H = {"Content-Type": "application/json", "X-CSRFToken": csrf}
ok("Auth OK")

def run(sql, schema=SCHEMA, limit=5):
    r = s.post(f"{BASE_URL}/superset/sql_json/", headers=H,
               json={"database_id": DB_ID, "schema": schema, "client_id": short_id(),
                     "sql": sql, "queryLimit": limit, "runAsync": False,
                     "select_as_cta": False}, timeout=30)
    if r.ok:
        return r.json().get("data", [])
    return None

# ── Permissoes por tabela ─────────────────────────────────
sep("PERMISSOES POR TABELA (siderdwh)")
checks = ", ".join(
    f"has_table_privilege('consultabipro', 'siderdwh.{t}', 'SELECT') AS {t[:30]}"
    for t in TABELAS
)
sql_check = f"SELECT {checks}"
r = s.post(f"{BASE_URL}/superset/sql_json/", headers=H,
           json={"database_id": DB_ID, "schema": SCHEMA, "client_id": short_id(),
                 "sql": sql_check, "queryLimit": 1, "runAsync": False,
                 "select_as_cta": False}, timeout=30)
if r.ok:
    row = r.json().get("data", [{}])[0]
    sem_acesso = []
    for tabela, tem in row.items():
        status = "[OK]" if tem else "[SEM]"
        print(f"  {status}  {tabela}")
        if not tem:
            sem_acesso.append(tabela)
    if sem_acesso:
        print(f"\n  Faltam grants em {len(sem_acesso)} tabelas:")
        for t in sem_acesso:
            print(f"    GRANT SELECT ON siderdwh.{t} TO consultabipro;")
    else:
        ok("Todas as tabelas tem SELECT!")
else:
    err(f"Verificacao falhou: {r.text[:300]}")

# ── Tentar a query do relatorio ───────────────────────────
sep("QUERY DO RELATORIO (10 linhas)")
with open(SQL_PATH, encoding="utf-8") as f:
    sql = f.read().rstrip().rstrip(";")

r = s.post(f"{BASE_URL}/superset/sql_json/", headers=H,
           json={"database_id": DB_ID, "schema": SCHEMA, "client_id": short_id(),
                 "sql": sql, "queryLimit": 10, "runAsync": False, "select_as_cta": False},
           timeout=180)
info(f"Status: {r.status_code}")
if r.ok:
    data = r.json()
    rows = data.get("data", [])
    cols = [c["name"] for c in data.get("columns", [])]
    ok(f"{len(rows)} linhas  |  {len(cols)} colunas")
    info(f"Colunas: {cols[:6]}...")
    if rows:
        info(f"1a linha: { {k: str(v)[:25] for k,v in list(rows[0].items())[:4]} }")
else:
    msg = r.json().get("errors", [{}])[0].get("message", r.text[:200]) if r.headers.get("content-type","").startswith("application/json") else r.text[:200]
    err(f"Erro: {msg}")

print("\n" + "="*60 + "\n  CONCLUIDO\n" + "="*60)
