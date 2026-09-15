from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_admin, require_publisher
from app.auth.service import hash_password
from app.db.models import (
    Group, RefreshLog, Report, ReportPermission, ReportSnapshot, ReportStatus,
    User, UserGroup, UserRole,
)
from app.db.session import get_db
from apscheduler.triggers.cron import CronTrigger
from app.reports.refresh import run_refresh, scheduler

router = APIRouter()
UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "reports"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _save_cover_image(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(400, "Arquivo de imagem inválido")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(400, "A capa do relatório deve ser uma imagem.")

    extension = Path(file.filename).suffix.lower() or ".png"
    filename = f"{uuid.uuid4().hex}{extension}"
    save_path = UPLOADS_DIR / filename

    with save_path.open("wb") as destination:
        while chunk := file.file.read(1024 * 1024):
            destination.write(chunk)

    return f"/uploads/reports/{filename}"


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: UserRole = UserRole.viewer


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.full_name))
    return result.scalars().all()


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "E-mail já cadastrado")
    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password:
        user.hashed_password = hash_password(body.password)
    await db.commit()
    await db.refresh(user)
    return user


# ── Groups ────────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    model_config = {"from_attributes": True}


@router.get("/groups", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Group).order_by(Group.name))
    return result.scalars().all()


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    group = Group(name=body.name, description=body.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.post("/groups/{group_id}/members/{user_id}", status_code=204)
async def add_member(group_id: int, user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    db.add(UserGroup(user_id=user_id, group_id=group_id))
    await db.commit()


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
async def remove_member(group_id: int, user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(
        select(UserGroup).where(UserGroup.group_id == group_id, UserGroup.user_id == user_id)
    )
    ug = result.scalar_one_or_none()
    if ug:
        await db.delete(ug)
        await db.commit()


# ── Reports ───────────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    title: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    slug: str
    sql_query: str
    chart_config: Optional[str] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    slug: Optional[str] = None
    sql_query: Optional[str] = None
    chart_config: Optional[str] = None


class StatusChange(BaseModel):
    status: ReportStatus


class ReportOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    cover_image_url: Optional[str] = None
    slug: str
    status: str
    refresh_schedule: Optional[str] = None
    next_refresh_at: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    last_refreshed_at: Optional[datetime] = None
    row_count: Optional[int] = None
    model_config = {"from_attributes": True}


class PermissionCreate(BaseModel):
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class PermissionOut(BaseModel):
    id: int
    user_id: Optional[int]
    group_id: Optional[int]
    model_config = {"from_attributes": True}


def _report_to_dict(r: Report) -> dict:
    job = scheduler.get_job(f"refresh_{r.id}")
    return {
        "id": r.id,
        "title": r.title,
        "description": r.description,
        "cover_image_url": r.cover_image_url,
        "slug": r.slug,
        "status": r.status,
        "refresh_schedule": r.refresh_schedule,
        "next_refresh_at": job.next_run_time.isoformat() if job and job.next_run_time else None,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "published_at": r.published_at,
        "last_refreshed_at": r.snapshot.refreshed_at if r.snapshot else None,
        "row_count": r.snapshot.row_count if r.snapshot else None,
    }


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(db: AsyncSession = Depends(get_db), _=Depends(require_publisher)):
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.snapshot))
        .order_by(Report.created_at.desc())
    )
    return [_report_to_dict(r) for r in result.scalars().all()]


@router.post("/reports", response_model=ReportOut, status_code=201)
async def create_report(
    body: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_publisher),
):
    report = Report(**body.model_dump(), created_by_id=current_user.id)
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _report_to_dict(report)


@router.put("/reports/{report_id}", response_model=ReportOut)
async def update_report(
    report_id: int,
    body: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_publisher),
):
    result = await db.execute(
        select(Report).options(selectinload(Report.snapshot)).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(report, field, value)
    await db.commit()
    await db.refresh(report)
    return _report_to_dict(report)


@router.patch("/reports/{report_id}/status", response_model=ReportOut)
async def change_status(
    report_id: int,
    body: StatusChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_publisher),
):
    result = await db.execute(
        select(Report).options(selectinload(Report.snapshot)).where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")
    # Arquivar exige admin
    if body.status == ReportStatus.archived and current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem arquivar relatórios")
    report.status = body.status
    if body.status == ReportStatus.published:
        report.published_at = datetime.utcnow()
        report.reviewed_by_id = current_user.id
    await db.commit()
    await db.refresh(report)
    return _report_to_dict(report)


@router.post("/reports/{report_id}/cover", response_model=ReportOut)
async def upload_report_cover(
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_publisher),
):
    result = await db.execute(select(Report).options(selectinload(Report.snapshot)).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    cover_url = _save_cover_image(file)
    report.cover_image_url = cover_url
    await db.commit()
    await db.refresh(report)
    return _report_to_dict(report)


@router.post("/reports/{report_id}/refresh")
async def refresh_snapshot(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_publisher),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Relatório não encontrado")
    try:
        return await run_refresh(report_id, triggered_by=current_user.email)
    except Exception as exc:
        raise HTTPException(500, f"Falha no refresh: {exc}") from exc


class ScheduleUpdate(BaseModel):
    cron: Optional[str] = None


@router.patch("/reports/{report_id}/schedule")
async def update_report_schedule(
    report_id: int,
    body: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_publisher),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")

    if body.cron:
        try:
            CronTrigger.from_crontab(body.cron, timezone="America/Recife")
        except Exception as exc:
            raise HTTPException(400, f"Expressão cron inválida: {exc}") from exc

    report.refresh_schedule = body.cron
    await db.commit()

    job_id = f"refresh_{report_id}"
    if body.cron:
        trigger = CronTrigger.from_crontab(body.cron, timezone="America/Recife")
        scheduler.add_job(
            run_refresh,
            trigger=trigger,
            id=job_id,
            kwargs={"report_id": report_id, "triggered_by": "scheduler"},
            replace_existing=True,
            misfire_grace_time=300,
        )
    else:
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

    job = scheduler.get_job(job_id)
    return {
        "refresh_schedule": report.refresh_schedule,
        "next_refresh_at": job.next_run_time.isoformat() if job and job.next_run_time else None,
    }


@router.get("/reports/{report_id}/refresh-logs")
async def list_refresh_logs(
    report_id: int,
    limit: int = Query(default=30, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_publisher),
):
    result = await db.execute(
        select(RefreshLog)
        .where(RefreshLog.report_id == report_id)
        .order_by(RefreshLog.started_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "triggered_by": log.triggered_by,
            "status": log.status,
            "row_count": log.row_count,
            "duration_ms": log.duration_ms,
            "error_message": log.error_message,
            "started_at": log.started_at,
        }
        for log in logs
    ]


@router.get("/reports/{report_id}/data")
async def preview_snapshot(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_publisher),
):
    snap_result = await db.execute(
        select(ReportSnapshot).where(ReportSnapshot.report_id == report_id)
    )
    snapshot = snap_result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(404, "Dados ainda não importados. Clique em 'Atualizar dados' primeiro.")
    return snapshot.data


@router.get("/reports/{report_id}/permissions", response_model=list[PermissionOut])
async def list_permissions(report_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(ReportPermission).where(ReportPermission.report_id == report_id))
    return result.scalars().all()


@router.post("/reports/{report_id}/permissions", response_model=PermissionOut, status_code=201)
async def add_permission(report_id: int, body: PermissionCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    perm = ReportPermission(report_id=report_id, **body.model_dump())
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return perm


@router.delete("/reports/{report_id}/permissions/{perm_id}", status_code=204)
async def remove_permission(report_id: int, perm_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(
        select(ReportPermission).where(ReportPermission.id == perm_id, ReportPermission.report_id == report_id)
    )
    perm = result.scalar_one_or_none()
    if perm:
        await db.delete(perm)
        await db.commit()
