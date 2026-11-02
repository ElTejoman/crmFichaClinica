"""Agenda de ejemplo (FICTICIA): catálogos, horarios, pacientes y citas. Idempotente.

Lo invoca `scripts/seed.py`. Usa los mismos servicios que la API, así los datos de ejemplo
cumplen todas las reglas (horario laboral, solapamientos, historia clínica automática…).
"""

from datetime import date, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import lima_today
from app.core.config import get_settings
from app.domain.agenda_rules import at_clinic_time
from app.domain.enums import Specialty
from app.repositories.agenda_catalog import AppointmentTypeRepository, RoomRepository
from app.repositories.appointments import AppointmentRepository
from app.repositories.audit import AuditRepository
from app.repositories.care_team import CareTeamRepository
from app.repositories.patients import PatientRepository
from app.repositories.schedules import ScheduleRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.agenda import AppointmentCreate, ExceptionCreate, WorkingBlockCreate
from app.schemas.patients import PatientCreate
from app.services.appointments import AppointmentService
from app.services.audit import AuditService, RequestContext
from app.services.patients import PatientService
from app.services.schedules import ScheduleService

S = Specialty
DEMO_TYPES: list[tuple[Specialty, str, int]] = [
    (S.ACUPUNCTURE, "Primera consulta", 60),
    (S.ACUPUNCTURE, "Sesión de control", 45),
    (S.NUTRITION, "Primera consulta", 60),
    (S.NUTRITION, "Control", 30),
    (S.CHIROPRACTIC, "Primera consulta", 45),
    (S.CHIROPRACTIC, "Ajuste", 30),
    (S.IV_THERAPY, "Evaluación previa", 30),
    (S.IV_THERAPY, "Sesión de sueroterapia", 60),
    (S.DENTISTRY, "Primera consulta", 45),
    (S.DENTISTRY, "Procedimiento", 60),
    (S.DENTISTRY, "Control", 30),
]
DEMO_ROOMS: list[tuple[str, set[Specialty]]] = [
    ("Consultorio 1", set()),  # sirve para cualquier especialidad
    ("Consultorio 2", {S.ACUPUNCTURE, S.CHIROPRACTIC}),
    ("Consultorio de nutrición", {S.NUTRITION}),
    ("Sala de sueroterapia", {S.IV_THERAPY}),
    ("Consultorio dental", {S.DENTISTRY}),
]
# (documento, nombres, apellidos, nacimiento, sexo, teléfono) — TODOS FICTICIOS.
DEMO_PATIENTS: list[tuple[str, str, str, str, str, str]] = [
    ("70000001", "María", "Gómez Ríos", "1988-03-14", "FEMALE", "987654321"),
    ("70000002", "José", "Pérez Núñez", "1975-07-22", "MALE", "955111222"),
    ("70000003", "Ana", "Quispe Huamán", "1992-11-05", "FEMALE", "944333111"),
    ("70000004", "Luis", "Vargas Soto", "1966-01-30", "MALE", "933222111"),
    ("70000005", "Carmen", "Flores Díaz", "1999-09-09", "FEMALE", "922111000"),
    ("70000006", "Jorge", "Castillo Rojas", "1983-04-18", "MALE", "911000999"),
]
# (índice de paciente, especialidad, tipo, días desde hoy, hora local, minuto)
DEMO_APPOINTMENTS: list[tuple[int, Specialty, str, int, int, int]] = [
    (0, S.ACUPUNCTURE, "Primera consulta", 1, 9, 0),
    (1, S.NUTRITION, "Primera consulta", 1, 10, 0),
    (2, S.CHIROPRACTIC, "Primera consulta", 1, 16, 0),
    (3, S.IV_THERAPY, "Sesión de sueroterapia", 2, 9, 0),
    (4, S.DENTISTRY, "Primera consulta", 2, 11, 0),
    (5, S.NUTRITION, "Control", 3, 15, 30),
    (0, S.ACUPUNCTURE, "Sesión de control", 8, 9, 0),
]


def _next_workday(days_ahead: int) -> date:
    """Día laborable (lun-vie) a `days_ahead` días o el siguiente si cae en fin de semana."""
    day = lima_today() + timedelta(days=days_ahead)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


async def seed_agenda(session: AsyncSession) -> int:
    """Crea lo que falte y devuelve cuántos registros nuevos hubo."""
    users = UserRepository(session)
    owner = await users.get_by_email("dueno@clinica-demo.pe")
    if owner is None:
        return 0
    uow, context = UnitOfWork(session), RequestContext(user_agent="seed")
    audit = AuditService(AuditRepository(session))
    schedules, rooms, types = (
        ScheduleRepository(session),
        RoomRepository(session),
        AppointmentTypeRepository(session),
    )
    patients_repo, appointments_repo = PatientRepository(session), AppointmentRepository(session)
    care_team = CareTeamRepository(session)
    schedule_service = ScheduleService(
        schedules=schedules,
        rooms=rooms,
        types=types,
        appointments=appointments_repo,
        users=users,
        audit=audit,
        uow=uow,
    )
    patient_service = PatientService(
        patients=patients_repo,
        care_team=care_team,
        users=users,
        audit=audit,
        uow=uow,
        settings=get_settings(),
    )
    appointment_service = AppointmentService(
        appointments=appointments_repo,
        schedules=schedules,
        rooms=rooms,
        types=types,
        patients=patients_repo,
        care_team=care_team,
        users=users,
        audit=audit,
        uow=uow,
    )

    created = 0
    known_types = {(t.specialty, t.name) for t in await types.list_types(only_active=False)}
    for specialty, name, minutes in DEMO_TYPES:
        if (specialty.value, name) not in known_types:
            await types.add(
                specialty=specialty.value, name=name, duration_minutes=minutes, is_active=True
            )
            created += 1
    known_rooms = {r.name for r in await rooms.list_rooms(only_active=False)}
    for name, specialties in DEMO_ROOMS:
        if name not in known_rooms:
            await rooms.add(
                name=name, specialties=sorted(s.value for s in specialties), is_active=True
            )
            created += 1
    await uow.commit()

    # Horario de cada doctor: lun-vie 09-13 y 15-19, sáb 09-13.
    weekly = [(d, time(9), time(13)) for d in range(6)] + [
        (d, time(15), time(19)) for d in range(5)
    ]
    for doctor in await users.list_doctors():
        if await schedules.list_blocks(doctor_user_ids=[doctor.id], only_active=False):
            continue
        for weekday, start, end in weekly:
            block = WorkingBlockCreate(
                doctor_user_id=doctor.id, weekday=weekday, start_time=start, end_time=end
            )
            await schedule_service.create_block(owner, block, context)
            created += 1

    if not await schedules.list_exceptions():
        christmas = lima_today().replace(month=12, day=25)
        if christmas < lima_today():
            christmas = christmas.replace(year=christmas.year + 1)
        holiday = ExceptionCreate(start_date=christmas, end_date=christmas, reason="Navidad")
        await schedule_service.create_exception(owner, holiday, context)
        created += 1

    people = []
    for document, first, last, birth, sex, phone in DEMO_PATIENTS:
        patient = await patients_repo.get_by_document("DNI", document)
        if patient is None:
            data = PatientCreate.model_validate(
                {
                    "document_type": "DNI",
                    "document_number": document,
                    "first_name": first,
                    "last_name": last,
                    "birth_date": birth,
                    "sex": sex,
                    "phone": phone,
                    "data_processing_consent": True,
                }
            )
            patient = await patient_service.create_patient(owner, data, context)
            created += 1
        people.append(patient)

    if not await appointments_repo.list_appointments(limit=1, offset=0):
        type_by_key = {(t.specialty, t.name): t for t in await types.list_types()}
        doctor_by_specialty = {
            specialty: doctor
            for doctor in await users.list_doctors()
            if doctor.doctor_profile
            for specialty in doctor.doctor_profile.specialty_names
        }
        for index, specialty, type_name, days, hour, minute in DEMO_APPOINTMENTS:
            doctor = doctor_by_specialty.get(specialty)
            appointment_type = type_by_key.get((specialty.value, type_name))
            if doctor is None or appointment_type is None:
                continue
            booking = AppointmentCreate(
                patient_id=people[index].id,
                doctor_user_id=doctor.id,
                specialty=specialty,
                starts_at=at_clinic_time(_next_workday(days), time(hour, minute)),
                appointment_type_id=appointment_type.id,
            )
            await appointment_service.create_appointment(owner, booking, context)
            created += 1
    return created
