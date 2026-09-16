import hashlib
import json
import logging
import random
import re
import string
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _short_id(n: int = 10) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))


class SupersetClient:
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        database_name: str,
        schema: str = "siderdwh",
        verify_ssl: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.database_name = database_name
        self.schema = schema
        self.verify_ssl = verify_ssl
        self._csrf_token: str | None = None
        self._jwt: str | None = None
        self._jwt_expires: datetime | None = None
        self._database_id: int | None = None
        self._http = httpx.AsyncClient(verify=self.verify_ssl)

    async def close(self) -> None:
        await self._http.aclose()

    async def _login(self) -> None:
        """Login via web form (establishes Flask session) + fetch JWT + CSRF token."""
        # 1. GET login page to extract form CSRF token
        page = await self._http.get(
            f"{self.base_url}/login/", follow_redirects=True, timeout=15.0
        )
        m = re.search(r'csrf_token[^>]+value=["\']([^"\']+)', page.text)
        form_csrf = m.group(1) if m else ""

        # 2. POST login form — establishes authenticated Flask session cookie
        await self._http.post(
            f"{self.base_url}/login/",
            data={"email": self.username, "password": self.password, "csrf_token": form_csrf},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            follow_redirects=True,
            timeout=30.0,
        )
        logger.info("Superset: sessão web estabelecida")

        # 3. Fetch JWT for REST API calls
        jwt_resp = await self._http.post(
            f"{self.base_url}/api/v1/security/login",
            json={"username": self.username, "password": self.password,
                  "provider": "db", "refresh": True},
            timeout=30.0,
        )
        jwt_resp.raise_for_status()
        self._jwt = jwt_resp.json()["access_token"]
        self._jwt_expires = datetime.now() + timedelta(hours=5)

        # 4. Fetch CSRF token for API POSTs (session cookie carried automatically)
        csrf_resp = await self._http.get(
            f"{self.base_url}/api/v1/security/csrf_token/",
            headers={"Authorization": f"Bearer {self._jwt}"},
            timeout=10.0,
        )
        csrf_resp.raise_for_status()
        self._csrf_token = csrf_resp.json().get("result", "")
        logger.info("Superset: JWT + CSRF token obtidos")

    async def _ensure_auth(self) -> None:
        if not self._jwt or datetime.now() >= (self._jwt_expires or datetime.min):
            await self._login()

    async def _resolve_database_id(self) -> int:
        if self._database_id:
            return self._database_id
        resp = await self._http.get(
            f"{self.base_url}/api/v1/database/",
            headers={"Authorization": f"Bearer {self._jwt}"},
            timeout=30.0,
        )
        resp.raise_for_status()
        for db in resp.json().get("result", []):
            if db["database_name"] == self.database_name:
                self._database_id = db["id"]
                logger.info("Superset: '%s' → database_id=%s", self.database_name, self._database_id)
                return self._database_id
        raise RuntimeError(f"Database '{self.database_name}' não encontrado no Superset")

    async def _execute(self, sql: str) -> list[dict[str, Any]]:
        await self._ensure_auth()
        db_id = await self._resolve_database_id()

        # Strip trailing semicolons — Superset wraps the SQL in a subquery for LIMIT
        clean_sql = sql.rstrip().rstrip(";")

        resp = await self._http.post(
            f"{self.base_url}/superset/sql_json/",
            headers={
                "Content-Type": "application/json",
                "X-CSRFToken": self._csrf_token or "",
            },
            json={
                "database_id": db_id,
                "sql": clean_sql,
                "client_id": _short_id(10),
                "schema": self.schema,
                "queryLimit": 50000,
                "runAsync": False,
                "select_as_cta": False,
            },
            timeout=120.0,
        )

        if not resp.is_success:
            logger.error("Superset sql_json error %s: %s", resp.status_code, resp.text[:2000])
        resp.raise_for_status()

        result = resp.json()
        columns = [col["name"] for col in result.get("columns", [])]
        rows = result.get("data", [])
        if not rows:
            return []
        if isinstance(rows[0], dict):
            return rows
        return [dict(zip(columns, row, strict=False)) for row in rows]

    async def query(self, sql: str) -> list[dict[str, Any]]:
        try:
            return await self._execute(sql)
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                # Re-authenticate and retry once
                self._jwt = None
                self._csrf_token = None
                await self._login()
                return await self._execute(sql)
            raise


_client: SupersetClient | None = None


def init_client(
    base_url: str,
    username: str,
    password: str,
    database_name: str,
    schema: str = "siderdwh",
    verify_ssl: bool = True,
) -> SupersetClient:
    global _client
    _client = SupersetClient(
        base_url=base_url,
        username=username,
        password=password,
        database_name=database_name,
        schema=schema,
        verify_ssl=verify_ssl,
    )
    return _client


def get_client() -> SupersetClient:
    if _client is None:
        raise RuntimeError("SupersetClient não inicializado")
    return _client


def cache_key(sql: str) -> str:
    return f"superset:{hashlib.md5(sql.encode()).hexdigest()}"


async def cached_query(sql: str, redis, ttl: int = 3600) -> list[dict[str, Any]]:
    key = cache_key(sql)
    hit = await redis.get(key)
    if hit:
        return json.loads(hit)
    data = await get_client().query(sql)
    await redis.set(key, json.dumps(data, default=str), ex=ttl)
    return data
