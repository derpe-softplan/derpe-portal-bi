import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class SupersetClient:
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        database_name: str,
        verify_ssl: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.database_name = database_name
        self.verify_ssl = verify_ssl
        self._token: str | None = None
        self._token_expires: datetime | None = None
        self._database_id: int | None = None

    async def _login(self) -> None:
        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/security/login",
                json={
                    "username": self.username,
                    "password": self.password,
                    "provider": "db",
                    "refresh": True,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            self._token_expires = datetime.now() + timedelta(hours=5)
            logger.info("Superset: login realizado")

    async def _token_valid(self) -> str:
        if not self._token or datetime.now() >= (self._token_expires or datetime.min):
            await self._login()
        return self._token  # type: ignore

    async def _resolve_database_id(self) -> int:
        if self._database_id:
            return self._database_id
        token = await self._token_valid()
        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/database/",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            resp.raise_for_status()
            for db in resp.json().get("result", []):
                if db["database_name"] == self.database_name:
                    self._database_id = db["id"]
                    logger.info(
                        f"Superset: '{self.database_name}' → database_id={self._database_id}"
                    )
                    return self._database_id
        raise RuntimeError(
            f"Database '{self.database_name}' não encontrado no Superset"
        )

    async def _execute(self, sql: str) -> list[dict[str, Any]]:
        token = await self._token_valid()
        db_id = await self._resolve_database_id()
        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            resp = await client.post(
                f"{self.base_url}/superset/sql_json/",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Referer": self.base_url,
                },
                json={
                    "database_id": db_id,
                    "sql": sql,
                    "client_id": str(uuid.uuid4()),
                    "queryLimit": 50000,
                    "runAsync": False,
                    "select_as_cta": False,
                },
                timeout=120.0,
            )
            resp.raise_for_status()
            result = resp.json()
            columns = [col["name"] for col in result.get("columns", [])]
            rows = result.get("data", [])
            if not rows:
                return []
            if isinstance(rows[0], dict):
                return rows
            return [dict(zip(columns, row)) for row in rows]

    async def query(self, sql: str) -> list[dict[str, Any]]:
        try:
            return await self._execute(sql)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                self._token = None
                return await self._execute(sql)
            raise


_client: SupersetClient | None = None


def init_client(
    base_url: str,
    username: str,
    password: str,
    database_name: str,
    verify_ssl: bool = True,
) -> SupersetClient:
    global _client
    _client = SupersetClient(base_url, username, password, database_name, verify_ssl)
    return _client


def get_client() -> SupersetClient:
    if _client is None:
        raise RuntimeError("SupersetClient não inicializado")
    return _client


def cache_key(sql: str) -> str:
    return f"superset:{hashlib.md5(sql.encode()).hexdigest()}"


async def cached_query(
    sql: str,
    redis,
    ttl: int = 3600,
) -> list[dict[str, Any]]:
    key = cache_key(sql)
    hit = await redis.get(key)
    if hit:
        return json.loads(hit)
    data = await get_client().query(sql)
    await redis.set(key, json.dumps(data, default=str), ex=ttl)
    return data
