import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    publisher = "publisher"
    viewer = "viewer"


class ReportStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    published = "published"
    archived = "archived"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.viewer)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    memberships = relationship("UserGroup", back_populates="user", cascade="all, delete-orphan")
    permissions = relationship(
        "ReportPermission", back_populates="user", foreign_keys="[ReportPermission.user_id]"
    )


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(500))

    memberships = relationship("UserGroup", back_populates="group", cascade="all, delete-orphan")
    permissions = relationship(
        "ReportPermission", back_populates="group", foreign_keys="[ReportPermission.group_id]"
    )


class UserGroup(Base):
    __tablename__ = "user_groups"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)

    user = relationship("User", back_populates="memberships")
    group = relationship("Group", back_populates="memberships")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    cover_image_url = Column(String(500), nullable=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    sql_query = Column(Text, nullable=False)
    chart_config = Column(Text)
    refresh_schedule = Column(String(100), nullable=True)
    status = Column(Enum(ReportStatus), nullable=False, default=ReportStatus.draft)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    permissions = relationship("ReportPermission", back_populates="report", cascade="all, delete-orphan")
    snapshot = relationship("ReportSnapshot", back_populates="report", uselist=False, cascade="all, delete-orphan")
    refresh_logs = relationship("RefreshLog", back_populates="report", cascade="all, delete-orphan")

    @property
    def access_profiles(self):
        return [p.group_id for p in self.permissions if p.group_id is not None]

    @property
    def access_users(self):
        return [p.user_id for p in self.permissions if p.user_id is not None]


class ReportSnapshot(Base):
    __tablename__ = "report_snapshots"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, unique=True)
    data = Column(JSON, nullable=False)
    row_count = Column(Integer, nullable=False, default=0)
    refreshed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    refreshed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    report = relationship("Report", back_populates="snapshot")
    refreshed_by = relationship("User", foreign_keys=[refreshed_by_id])


class RefreshLog(Base):
    __tablename__ = "refresh_logs"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    triggered_by = Column(String(100), nullable=False)  # "scheduler" ou email do usuário
    status = Column(String(10), nullable=False)          # "success" | "error"
    row_count = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    report = relationship("Report", back_populates="refresh_logs")


class ReportPermission(Base):
    __tablename__ = "report_permissions"
    __table_args__ = (UniqueConstraint("report_id", "user_id", "group_id"),)

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)

    report = relationship("Report", back_populates="permissions")
    user = relationship("User", back_populates="permissions", foreign_keys=[user_id])
    group = relationship("Group", back_populates="permissions", foreign_keys=[group_id])
