import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, UniqueConstraint,
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
    slug = Column(String(100), unique=True, nullable=False, index=True)
    sql_query = Column(Text, nullable=False)
    chart_config = Column(Text)
    status = Column(Enum(ReportStatus), nullable=False, default=ReportStatus.draft)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    permissions = relationship("ReportPermission", back_populates="report", cascade="all, delete-orphan")


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
