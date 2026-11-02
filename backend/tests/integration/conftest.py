"""Escenario de agenda compartido por los tests de citas y de configuración."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient, Response

from app.domain.enums import Role, Specialty
from app.models.user import User
from tests.agenda_helpers import iso, next_monday
from tests.helpers import SessionFactory, create_user, login, patient_payload

AsRole = Callable[..., Awaitable[dict[str, str]]]
WEEKDAYS = range(5)  # lunes a viernes


@dataclass
class Agenda:
    """Clínica de prueba: un doctor de acupuntura con horario lun-vie 09-13 y 15-19."""

    client: AsyncClient
    session_factory: SessionFactory
    as_role: AsRole
    reception: dict[str, str]
    owner: dict[str, str]
    doctor: User
    doctor_headers: dict[str, str]
    patients: list[dict[str, Any]]
    type_id: str  # ACUPUNCTURE · "Primera consulta" · 60 min
    room_id: str  # sala apta para cualquier especialidad
    monday: date

    async def book(
        self,
        hour: int,
        minute: int = 0,
        *,
        day: date | None = None,
        patient: int = 0,
        doctor: User | None = None,
        headers: dict[str, str] | None = None,
        **overrides: Any,
    ) -> Response:
        """Agenda una cita de acupuntura (por defecto: lunes, paciente 0, tipo de 60 min)."""
        body: dict[str, Any] = {
            "patient_id": self.patients[patient]["id"],
            "doctor_user_id": str((doctor or self.doctor).id),
            "specialty": "ACUPUNCTURE",
            "starts_at": iso(day or self.monday, hour, minute),
            "appointment_type_id": self.type_id,
        }
        body.update(overrides)
        return await self.client.post("/appointments", json=body, headers=headers or self.reception)

    async def ok(self, hour: int, minute: int = 0, **kwargs: Any) -> dict[str, Any]:
        response = await self.book(hour, minute, **kwargs)
        assert response.status_code == 201, response.text
        return response.json()  # type: ignore[no-any-return]

    async def new_doctor(
        self, email: str, specialties: set[Specialty] | None = None, *, with_schedule: bool = True
    ) -> User:
        doctor = await create_user(
            self.session_factory, email, [Role.DOCTOR], specialties=specialties
        )
        if with_schedule:
            await add_week(self.client, self.owner, str(doctor.id))
        return doctor


async def add_week(client: AsyncClient, headers: dict[str, str], doctor_id: str) -> None:
    """Horario estándar: lun-vie 09-13 y 15-19."""
    for weekday in WEEKDAYS:
        for start, end in (("09:00:00", "13:00:00"), ("15:00:00", "19:00:00")):
            response = await client.post(
                "/schedules",
                json={
                    "doctor_user_id": doctor_id,
                    "weekday": weekday,
                    "start_time": start,
                    "end_time": end,
                },
                headers=headers,
            )
            assert response.status_code == 201, response.text


@pytest.fixture
async def agenda(client: AsyncClient, as_role: AsRole, session_factory: SessionFactory) -> Agenda:
    reception = await as_role(Role.RECEPTION)
    owner = await as_role(Role.OWNER)
    doctor = await create_user(
        session_factory, "doctora@clinica-demo.pe", [Role.DOCTOR], full_name="Dra. Acu"
    )
    doctor_headers = await login(client, "doctora@clinica-demo.pe")
    await add_week(client, owner, str(doctor.id))

    patients = []
    for first in ("Ana", "Beto", "Carla"):
        response = await client.post(
            "/patients", json=patient_payload(first_name=first), headers=reception
        )
        assert response.status_code == 201
        patients.append(response.json())

    appointment_type = await client.post(
        "/appointment-types",
        json={"specialty": "ACUPUNCTURE", "name": "Primera consulta", "duration_minutes": 60},
        headers=owner,
    )
    room = await client.post("/rooms", json={"name": "Consultorio 1"}, headers=owner)
    return Agenda(
        client=client,
        session_factory=session_factory,
        as_role=as_role,
        reception=reception,
        owner=owner,
        doctor=doctor,
        doctor_headers=doctor_headers,
        patients=patients,
        type_id=appointment_type.json()["id"],
        room_id=room.json()["id"],
        monday=next_monday(),
    )
