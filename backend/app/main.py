import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy import select

from app.config import settings
from app.db.base import Base
from app.db.models import User, UserRole
from app.db.session import AsyncSessionLocal, engine
from app.auth.service import hash_password
import app.superset.client as superset_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

redis_client: Redis = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tabelas criadas/verificadas")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == settings.admin_email))
        if not result.scalar_one_or_none():
            admin = User(
                email=settings.admin_email,
                full_name="Administrador",
                hashed_password=hash_password(settings.admin_password),
                role=UserRole.admin,
            )
            session.add(admin)
            await session.commit()
            logger.info(f"Usuário admin criado: {settings.admin_email}")

    superset_module.init_client(
        base_url=settings.superset_url,
        username=settings.superset_user,
        password=settings.superset_password,
        database_name=settings.superset_database_name,
        verify_ssl=settings.superset_verify_ssl,
    )

    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Redis conectado")

    yield

    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(title="DER-PE Portal BI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.auth.router import router as auth_router
from app.admin.router import router as admin_router
from app.portal.router import router as portal_router

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(portal_router, prefix="/api/portal", tags=["portal"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
