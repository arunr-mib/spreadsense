from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User, UserRole
from app.core.security import verify_password, hash_password


async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def register_user(email: str, password: str, full_name: str, role: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        return None
    role_enum = UserRole(role) if role in UserRole._value2member_map_ else UserRole.analyst
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role=role_enum,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user
