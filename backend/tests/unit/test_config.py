import pytest
from pydantic import SecretStr

from app.core.config import Settings


def test_production_rejects_development_jwt_secret() -> None:
    settings = Settings(environment="production")
    with pytest.raises(RuntimeError):
        settings.assert_safe_for_production()


def test_production_accepts_custom_secret() -> None:
    settings = Settings(environment="production", jwt_secret=SecretStr("x" * 48))
    settings.assert_safe_for_production()  # no lanza


def test_development_allows_default_secret() -> None:
    Settings(environment="development").assert_safe_for_production()
