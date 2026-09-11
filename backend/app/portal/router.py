from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.models import Report, ReportPermission, ReportSnapshot, ReportStatus, User, UserGroup
from app.db.session import get_db

router = APIRouter()


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


def _report_card(r: Report) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "description": r.description,
        "cover_image_url": r.cover_image_url,
        "slug": r.slug,
        "published_at": r.published_at,
        "last_refreshed_at": r.snapshot.refreshed_at if r.snapshot else None,
        "row_count": r.snapshot.row_count if r.snapshot else None,
    }


@router.get("/reports")
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ids = await _accessible_report_ids(user, db)
    if not ids:
        return []
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.snapshot))
        .where(Report.id.in_(ids), Report.status == ReportStatus.published)
        .order_by(Report.title)
    )
    return [_report_card(r) for r in result.scalars().all()]


@router.get("/reports/{slug}")
async def get_report(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    is_admin = user.role.value in ("admin", "publisher")

    status_filter = (
        Report.status.in_([ReportStatus.published, ReportStatus.in_review])
        if is_admin
        else Report.status == ReportStatus.published
    )

    result = await db.execute(
        select(Report)
        .options(selectinload(Report.snapshot))
        .where(Report.slug == slug, status_filter)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    if not is_admin:
        ids = await _accessible_report_ids(user, db)
        if report.id not in ids:
            raise HTTPException(403, "Sem permissão para este relatório")

    return _report_card(report)


@router.get("/reports/{slug}/data")
async def get_report_data(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    is_admin = user.role.value in ("admin", "publisher")

    status_filter = (
        Report.status.in_([ReportStatus.published, ReportStatus.in_review])
        if is_admin
        else Report.status == ReportStatus.published
    )

    result = await db.execute(
        select(Report).where(Report.slug == slug, status_filter)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    if not is_admin:
        ids = await _accessible_report_ids(user, db)
        if report.id not in ids:
            raise HTTPException(403, "Sem permissão para este relatório")

    snap_result = await db.execute(
        select(ReportSnapshot).where(ReportSnapshot.report_id == report.id)
    )
    snapshot = snap_result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(
            404,
            "Dados ainda não importados. Um publicador precisa clicar em 'Atualizar dados'.",
        )

    return snapshot.data
