"""Directorio de doctores (lectura para asignar pacientes y leads)."""

from fastapi import APIRouter

from app.api.deps import PatientsReader, UserServiceDep
from app.schemas.patients import DoctorSummary

router = APIRouter(prefix="/doctors", tags=["doctores"])


@router.get("", response_model=list[DoctorSummary])
async def list_doctors(_: PatientsReader, service: UserServiceDep) -> list[DoctorSummary]:
    doctors = await service.list_doctors()
    return [
        DoctorSummary(
            id=d.id,
            full_name=d.full_name,
            specialties=d.doctor_profile.specialty_names if d.doctor_profile else [],
        )
        for d in doctors
    ]
