import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from redis.asyncio import Redis
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import app.superset.client as superset_module
from app.auth.service import hash_password, verify_password
from app.config import settings
from app.db.models import Report, ReportStatus, User, UserRole
from app.db.session import AsyncSessionLocal, engine
from app.limiter import limiter
from app.reports import CATALOG
from app.reports.refresh import scheduler, setup_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "reports"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

redis_client: Redis = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client

    logger.info("Schema gerenciado pelo Alembic — migrations aplicadas no startup do container")

    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(User).where(User.email == settings.admin_email))
            existing_admin = result.scalar_one_or_none()
            if not existing_admin:
                session.add(User(
                    username=settings.admin_username,
                    email=settings.admin_email,
                    full_name="Administrador",
                    hashed_password=hash_password(settings.admin_password),
                    role=UserRole.admin,
                    is_active=True,
                ))
                await session.commit()
                logger.info(f"Usuário admin criado: {settings.admin_email} (username: {settings.admin_username})")
            else:
                existing_admin.full_name = "Administrador"
                existing_admin.role = UserRole.admin
                existing_admin.is_active = True
                if not existing_admin.username:
                    existing_admin.username = settings.admin_username
                if not verify_password(settings.admin_password, existing_admin.hashed_password):
                    existing_admin.hashed_password = hash_password(settings.admin_password)
                await session.commit()
                logger.info(f"Admin sincronizado: {settings.admin_email} (username: {settings.admin_username})")
        except IntegrityError:
            await session.rollback()

    schedule_map: dict[int, str] = {}
    async with AsyncSessionLocal() as session:
        for spec in CATALOG:
            try:
                result = await session.execute(
                    select(Report).where(Report.panel_slug == spec.slug)
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    report = Report(
                        title=spec.title,
                        description=spec.description,
                        slug=spec.slug,
                        panel_slug=spec.slug,
                        sql_query=spec.sql,
                        refresh_schedule=spec.refresh_schedule,
                        status=ReportStatus.in_review,
                        tipos=spec.tipos,
                    )
                    session.add(report)
                    logger.info(f"Relatório registrado: '{spec.title}'")
                else:
                    existing.title = spec.title
                    existing.description = spec.description
                    existing.sql_query = spec.sql
                    existing.panel_slug = spec.slug  # sempre reflete o nome da pasta
                    if spec.tipos is not None:
                        existing.tipos = spec.tipos
                    # slug e refresh_schedule não são sobrescritos — gerenciados pela UI
                    logger.info(f"Relatório sincronizado: '{spec.title}'")
                await session.commit()
            except IntegrityError:
                await session.rollback()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Report).where(Report.refresh_schedule.isnot(None))
        )
        for report in result.scalars().all():
            schedule_map[report.id] = report.refresh_schedule

    setup_scheduler(schedule_map)
    scheduler.start()
    logger.info("Scheduler iniciado com %d job(s)", len(schedule_map))

    superset_module.init_client(
        base_url=settings.superset_url,
        username=settings.superset_user,
        password=settings.superset_password,
        database_name=settings.superset_database_name,
        schema=settings.superset_schema,
        verify_ssl=settings.superset_verify_ssl,
    )

    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Redis conectado")

    yield

    scheduler.shutdown(wait=False)
    await redis_client.aclose()
    await superset_module.get_client().close()
    await engine.dispose()


app = FastAPI(title="DER-PE Portal BI", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR.parent)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.admin.router import router as admin_router  # noqa: E402
from app.auth.router import router as auth_router  # noqa: E402
from app.portal.router import router as portal_router  # noqa: E402

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(portal_router, prefix="/api/portal", tags=["portal"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
