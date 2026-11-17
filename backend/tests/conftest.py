"""Ensure DB schema exists before API tests — CI clones have no pre-built backend/data/app.db."""

import os
import tempfile
from pathlib import Path

# Must run before any `app` import so the engine binds to a throwaway database
# instead of the developer's backend/data/app.db (or a real DATABASE_URL).
_TEST_DB = Path(tempfile.mkdtemp(prefix="calorie-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"

import pytest  # noqa: E402

from app.db.database import init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _ensure_db_schema() -> None:
    init_db()
