from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=False,
    # Neon auto-suspends idle compute and silently closes pooled connections.
    # pool_pre_ping issues a cheap SELECT 1 on checkout so SQLAlchemy can
    # discard dead sockets before the user's query hits them; pool_recycle
    # force-rotates connections older than 5min as belt-and-suspenders.
    pool_pre_ping=True,
    pool_recycle=300,
)
AsyncSessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
