"""Endpoints de autenticación. El refresh token viaja solo en cookie httpOnly."""

from fastapi import APIRouter, Request, Response, status

from app.api.deps import AuthServiceDep, ContextDep, CurrentUser, SettingsDep
from app.core.config import Settings
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.users import UserRead
from app.services.auth import SessionTokens

router = APIRouter(prefix="/auth", tags=["autenticación"])


def _set_refresh_cookie(response: Response, tokens: SessionTokens, settings: Settings) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=tokens.refresh_token,
        max_age=tokens.refresh_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path=settings.refresh_cookie_path,
    )


def _token_response(tokens: SessionTokens) -> TokenResponse:
    return TokenResponse(access_token=tokens.access_token, expires_in=tokens.expires_in_seconds)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    service: AuthServiceDep,
    context: ContextDep,
    settings: SettingsDep,
) -> TokenResponse:
    tokens = await service.login(body.email, body.password, context)
    _set_refresh_cookie(response, tokens, settings)
    return _token_response(tokens)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    service: AuthServiceDep,
    context: ContextDep,
    settings: SettingsDep,
) -> TokenResponse:
    tokens = await service.refresh(request.cookies.get(settings.refresh_cookie_name), context)
    _set_refresh_cookie(response, tokens, settings)
    return _token_response(tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    service: AuthServiceDep,
    context: ContextDep,
    settings: SettingsDep,
) -> None:
    await service.logout(request.cookies.get(settings.refresh_cookie_name), context)
    response.delete_cookie(settings.refresh_cookie_name, path=settings.refresh_cookie_path)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
