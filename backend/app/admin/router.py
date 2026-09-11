from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin, require_publisher
from app.auth.service import hash_password
from app.db.models import (
    Group, Report, ReportPermission, ReportStatus,
    User, UserGroup, UserRole,
)
from app.db.session import get_db

router = APIRouter()


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
    slug: str
    sql_query: str
    chart_config: Optional[str] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    sql_query: Optional[str] = None
    chart_config: Optional[str] = None


class StatusChange(BaseModel):
    status: ReportStatus


class ReportOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    slug: str
    status: str
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    model_config = {"from_attributes": True}


class PermissionCreate(BaseModel):
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class PermissionOut(BaseModel):
    id: int
    user_id: Optional[int]
    group_id: Optional[int]
    model_config = {"from_attributes": True}


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(db: AsyncSession = Depends(get_db), _=Depends(require_publisher)):
    result = await db.execute(select(Report).order_by(Report.created_at.desc()))
    return result.scalars().all()


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
    return report


@router.put("/reports/{report_id}", response_model=ReportOut)
async def update_report(report_id: int, body: ReportUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_publisher)):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(report, field, value)
    await db.commit()
    await db.refresh(report)
    return report


@router.patch("/reports/{report_id}/status", response_model=ReportOut)
async def change_status(
    report_id: int,
    body: StatusChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Relatório não encontrado")
    report.status = body.status
    if body.status == ReportStatus.published:
        report.published_at = datetime.utcnow()
        report.reviewed_by_id = current_user.id
    await db.commit()
    await db.refresh(report)
    return report


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
