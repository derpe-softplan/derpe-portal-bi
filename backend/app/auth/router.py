from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.service import create_access_token, hash_password, verify_password
from app.config import settings
from app.db.models import User
from app.db.session import get_db
from app.limiter import limiter

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    email: str | None = None


class UserOut(BaseModel):
    id: int
    username: str | None
    email: str | None
    full_name: str
    role: str
    must_change_password: bool = False

    model_config = {"from_attributes": True}


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(user.id, user.email, user.role.value)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.jwt_expire_hours * 3600,
    )
    return {"user": UserOut.model_validate(user)}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Senha atual incorreta")
    if len(body.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A nova senha deve ter pelo menos 8 caracteres")
    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    await db.commit()
    await db.refresh(user)
    return {"user": UserOut.model_validate(user)}


@router.put("/profile")
async def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.email is not None:
        user.email = body.email.strip() or None
    await db.commit()
    await db.refresh(user)
    return {"user": UserOut.model_validate(user)}
