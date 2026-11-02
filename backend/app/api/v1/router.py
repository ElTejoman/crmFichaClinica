"""Router agregador de la versión 1 de la API.

Cada fase añade aquí su router (patients, leads, agenda, clinical...).
"""

from fastapi import APIRouter

from app.api.v1 import audit, auth, health, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(audit.router)
