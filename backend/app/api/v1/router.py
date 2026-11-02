"""Router agregador de la versión 1 de la API.

Cada fase añade aquí su router (auth, patients, leads, agenda, clinical...).
"""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)
