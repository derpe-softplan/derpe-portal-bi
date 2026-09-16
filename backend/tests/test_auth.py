"""
Testes de autenticação — login, logout e /me.

Usa httpx.AsyncClient com o app FastAPI em modo ASGI (sem servidor real).
O banco é substituído por um SQLite em memória via override de dependência.
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.auth.service import hash_password
from app.db.base import Base
from app.db.models import User, UserRole
from app.db.session import get_db
from app.main import app

# ── Banco em memória para testes ──────────────────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSession() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with TestSession() as session:
        user = User(
            email="test@der.pe.gov.br",
            full_name="Teste",
            hashed_password=hash_password("senha123"),
            role=UserRole.viewer,
            is_active=True,
        )
        session.add(user)
        await session.commit()
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Testes ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_valido(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"email": "test@der.pe.gov.br", "password": "senha123"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "test@der.pe.gov.br"
    assert "access_token" in r.cookies


@pytest.mark.asyncio
async def test_login_senha_errada(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"email": "test@der.pe.gov.br", "password": "errada"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_usuario_inexistente(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"email": "nao@existe.com", "password": "senha123"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_sem_auth(client: AsyncClient):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_com_auth(client: AsyncClient):
    await client.post("/api/auth/login", json={"email": "test@der.pe.gov.br", "password": "senha123"})
    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "test@der.pe.gov.br"


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    await client.post("/api/auth/login", json={"email": "test@der.pe.gov.br", "password": "senha123"})
    r = await client.post("/api/auth/logout")
    assert r.status_code == 200
