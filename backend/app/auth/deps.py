from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.db.models import User, UserRole
from app.db.session import get_db


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticado",
    )
    if not access_token:
        raise credentials_exception
    payload = decode_token(access_token)
    if not payload.get("sub"):
        raise credentials_exception
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exception
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return user


async def require_publisher(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.admin, UserRole.publisher):
        raise HTTPException(status_code=403, detail="Acesso restrito")
    return user


async def require_cronograma_editor(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin and not user.can_edit_cronograma:
        raise HTTPException(status_code=403, detail="Sem permissão para editar o cronograma")
    return user
