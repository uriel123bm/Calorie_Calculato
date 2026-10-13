"""Alembic environment — reads DATABASE_URL from the app config so migrations
work identically in development (SQLite) and production (PostgreSQL)."""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Allow imports from the backend root (app.db.models, etc.)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.database import Base, engine  # noqa: E402 – after sys.path
import app.db.models  # noqa: F401 – registers all ORM models with Base.metadata

config = context.config

# Honour logging config from alembic.ini when present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_url() -> str:
    """Return the database URL, preferring the app's resolved engine URL."""
    raw = os.getenv("DATABASE_URL", "").strip()
    if raw:
        if raw.startswith("postgres://"):
            raw = raw.replace("postgres://", "postgresql+psycopg2://", 1)
        elif raw.startswith("postgresql://") and "+psycopg2" not in raw:
            raw = raw.replace("postgresql://", "postgresql+psycopg2://", 1)
        return raw
    # Fallback: use the engine already configured by app.db.database
    return str(engine.url)


def run_migrations_offline() -> None:
    url = _get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # required for SQLite ALTER TABLE emulation
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = _get_url()
    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # required for SQLite ALTER TABLE emulation
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
