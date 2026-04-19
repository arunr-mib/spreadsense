from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.modules.auth.service import authenticate_user, register_user
from app.core.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await register_user(body.email, body.password, body.full_name, body.role or "analyst", db)
    if not user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    token = create_access_token(user.id, user.role.value)
    return TokenResponse(
        access_token=token,
        role=user.role.value,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(body.email, body.password, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.id, user.role.value)
    return TokenResponse(
        access_token=token,
        role=user.role.value,
        user_id=user.id,
        full_name=user.full_name,
    )
