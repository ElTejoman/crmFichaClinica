"""Router agregador de la versión 1 de la API.

Cada fase añade aquí su router (patients, leads, agenda, clinical...).
"""

from fastapi import APIRouter

from app.api.v1 import (
    agenda_config,
    appointments,
    attachments,
    audit,
    auth,
    clinical,
    consents,
    doctors,
    encounters,
    health,
    leads,
    patients,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(audit.router)
api_router.include_router(patients.router)
api_router.include_router(leads.router)
api_router.include_router(doctors.router)
api_router.include_router(appointments.router)
api_router.include_router(agenda_config.router)
api_router.include_router(clinical.router)
api_router.include_router(encounters.router)
api_router.include_router(consents.router)
api_router.include_router(attachments.router)
