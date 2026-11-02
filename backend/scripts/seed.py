"""Datos de ejemplo (FICTICIOS). Idempotente: se puede ejecutar varias veces.

Uso:  python scripts/seed.py
NUNCA ejecutar en producción: las contraseñas son públicas y solo sirven para demo.
"""

import asyncio
import sys

from app.core.config import get_settings
from app.core.database import build_engine, build_session_factory
from app.core.security import hash_password
from app.domain.enums import ProfessionalBody, Role, Specialty
from app.repositories.users import UserRepository

DEMO_PASSWORD = "Demo-Clinica-2026!"  # noqa: S105  (credencial de demo documentada)

# (email, nombre, roles, colegio, nº colegiatura, especialidades)
DEMO_USERS: list[tuple[str, str, set[Role], ProfessionalBody | None, str, set[Specialty]]] = [
    ("super@clinica-demo.pe", "Admin Sistema", {Role.SUPERUSER}, None, "", set()),
    (
        "dueno@clinica-demo.pe",
        "Dra. Carmen Quispe (Dueña)",
        {Role.OWNER, Role.DOCTOR},
        ProfessionalBody.CMP,
        "CMP-045123",
        {Specialty.ACUPUNCTURE},
    ),
    (
        "nutricion@clinica-demo.pe",
        "Lic. Rosa Mendoza",
        {Role.DOCTOR},
        ProfessionalBody.CNP,
        "CNP-009871",
        {Specialty.NUTRITION},
    ),
    (
        "quiropraxia@clinica-demo.pe",
        "Dr. Luis Paredes",
        {Role.DOCTOR},
        ProfessionalBody.OTHER,
        "QUI-001234",
        {Specialty.CHIROPRACTIC},
    ),
    (
        "sueros@clinica-demo.pe",
        "Dr. Andrés Salazar",
        {Role.DOCTOR},
        ProfessionalBody.CMP,
        "CMP-052200",
        {Specialty.IV_THERAPY},
    ),
    (
        "odontologia@clinica-demo.pe",
        "Dra. Lucía Torres",
        {Role.DOCTOR},
        ProfessionalBody.COP,
        "COP-030456",
        {Specialty.DENTISTRY},
    ),
    ("recepcion@clinica-demo.pe", "Marisol Rojas", {Role.RECEPTION}, None, "", set()),
    ("paciente@clinica-demo.pe", "Paciente de Prueba", {Role.PATIENT}, None, "", set()),
]


async def seed() -> None:
    settings = get_settings()
    if settings.environment == "production":
        sys.exit("Seed bloqueado en producción")

    engine = build_engine()
    factory = build_session_factory(engine)
    created = 0
    async with factory() as session:
        repo = UserRepository(session)
        for email, name, roles, body, license_number, specialties in DEMO_USERS:
            if await repo.get_by_email(email):
                continue
            user = await repo.add(
                email=email,
                password_hash=hash_password(DEMO_PASSWORD),
                full_name=name,
                phone=None,
                roles=roles,
            )
            if Role.DOCTOR in roles and body is not None:
                await repo.set_doctor_profile(
                    user,
                    license_number=license_number,
                    professional_body=body.value,
                    rne=None,
                    specialties=specialties,
                )
            created += 1
        await session.commit()
    await engine.dispose()
    print(f"Seed listo: {created} usuarios nuevos. Contraseña demo: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
