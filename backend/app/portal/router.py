from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import Report, ReportPermission, ReportStatus, User, UserGroup
from app.db.session import get_db
from app.superset.client import cached_query

router = APIRouter()


async def get_redis() -> Redis:
    from app.main import redis_client
    return redis_client


class ReportCard(BaseModel):
    id: int
    title: str
    description: Optional[str]
    slug: str
    published_at: Optional[datetime]
    model_config = {"from_attributes": True}


async def _accessible_report_ids(user: User, db: AsyncSession) -> list[int]:
    if user.role.value == "admin":
        result = await db.execute(select(Report.id).where(Report.status == ReportStatus.published))
        return [r[0] for r in result.all()]

    user_group_ids_q = await db.execute(
        select(UserGroup.group_id).where(UserGroup.user_id == user.id)
    )
    user_group_ids = [r[0] for r in user_group_ids_q.all()]

    conditions = [ReportPermission.user_id == user.id]
    if user_group_ids:
        conditions.append(ReportPermission.group_id.in_(user_group_ids))

    perm_result = await db.execute(
        select(ReportPermission.report_id).where(or_(*conditions))
    )
    return list({r[0] for r in perm_result.all()})


@router.get("/reports", response_model=list[ReportCard])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ids = await _accessible_report_ids(user, db)
    if not ids:
        return []
    result = await db.execute(
        select(Report)
        .where(Report.id.in_(ids), Report.status == ReportStatus.published)
        .order_by(Report.title)
    )
    return result.scalars().all()


@router.get("/reports/{slug}")
async def get_report(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report).where(Report.slug == slug, Report.status == ReportStatus.published)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    ids = await _accessible_report_ids(user, db)
    if report.id not in ids:
        raise HTTPException(403, "Sem permissão para este relatório")

    return ReportCard.model_validate(report)


@router.get("/reports/{slug}/data")
async def get_report_data(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[dict[str, Any]]:
    from app.config import settings

    result = await db.execute(
        select(Report).where(Report.slug == slug, Report.status == ReportStatus.published)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    ids = await _accessible_report_ids(user, db)
    if report.id not in ids:
        raise HTTPException(403, "Sem permissão para este relatório")

    return await cached_query(report.sql_query, redis, ttl=settings.cache_ttl)
