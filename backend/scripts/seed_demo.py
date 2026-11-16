"""Datos de demo "en uso" (FICTICIOS): ~12 semanas de actividad simulada + 2 semanas de agenda.

Uso (después de `seed.py`, una sola vez):  python scripts/seed_demo.py

Cómo funciona: se reemplaza el reloj de la app (`utcnow` / `lima_today`) por uno simulado ANTES
de importar los servicios. Así cada cita, atención firmada, consentimiento y lead pasa por las
MISMAS reglas que la API (horario, solapamientos, checklist de firma, hash de integridad,
auditoría encadenada), pero fechado en el pasado. Al final se corrigen `created_at` de citas,
pacientes y leads (la BD los pone con `now()`), que la interfaz muestra.
NUNCA ejecutar en producción.
"""

# ruff: noqa: E402, S101, S311  (reloj parcheado antes de importar; script de desarrollo)
import asyncio
import random
import sys
import unicodedata
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import app.core.clock as clock
from app.core.config import CLINIC_TIMEZONE

LIMA = ZoneInfo(CLINIC_TIMEZONE)
_real_utcnow = clock.utcnow
_fake_now: datetime | None = None


def _utcnow() -> datetime:
    return _fake_now if _fake_now is not None else _real_utcnow()


def _lima_today() -> date:
    return _utcnow().astimezone(LIMA).date()


clock.utcnow = _utcnow
clock.lima_today = _lima_today

from seed_demo_content import (  # mismo directorio: scripts/
    ADDENDA,
    ADMIN_NOTES,
    CANCEL_REASONS,
    CONTACT_NOTES,
    DIRECT_SOURCES,
    DISTRICTS,
    FEMALE_NAMES,
    FIRST_TYPE,
    FOLLOW_TYPES,
    INSURANCES,
    LAST_NAMES,
    LEAD_NOTES,
    LEAD_SOURCES,
    LOST_REASONS,
    MALE_NAMES,
    OCCUPATIONS,
    OPEN_LEAD_PLAN,
    PROFILES,
    RELATIONS,
    ROOMS,
    SPECIALTY_CONSENT,
    SPECIALTY_PLAN,
    STREETS,
    Profile,
)
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import build_engine, build_session_factory
from app.domain.enums import (
    AllergySeverity,
    ConsentMethod,
    ConsentType,
    LeadActivityType,
    LeadSource,
    LeadStatus,
    RecordStatus,
    Specialty,
    VitalContext,
)
from app.models.agenda import Appointment, AppointmentType, Room
from app.models.lead import Lead
from app.models.patient import Patient
from app.models.user import User
from app.repositories.agenda_catalog import AppointmentTypeRepository, RoomRepository
from app.repositories.appointments import AppointmentRepository
from app.repositories.audit import AuditRepository
from app.repositories.care_team import CareTeamRepository
from app.repositories.clinical_records import ClinicalRecordRepository
from app.repositories.consents import ConsentRepository
from app.repositories.encounters import EncounterRepository
from app.repositories.leads import LeadRepository
from app.repositories.patients import PatientRepository
from app.repositories.schedules import ScheduleRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.agenda import AppointmentCreate
from app.schemas.clinical import (
    AddendumCreate,
    DiagnosisIn,
    EncounterCreate,
    EncounterUpdate,
    VitalSignsIn,
)
from app.schemas.leads import LeadActivityCreate, LeadConvert, LeadCreate, LeadUpdate
from app.schemas.patients import PatientCreate
from app.services.appointments import AppointmentService
from app.services.audit import AuditService, RequestContext
from app.services.clinical_access import ClinicalAccess
from app.services.encounters import EncounterService
from app.services.leads import LeadService
from app.services.patients import PatientService

RNG = random.Random(20261115)
HISTORY_WEEKS = 12
FUTURE_DAYS = 14
VIA_LEAD_SHARE = 0.25
CROSS_SPECIALTY_STORIES = 10
# Horario de los doctores creado por seed_agenda: lun-vie 09-13 y 15-19, sáb 09-13.
BLOCKS = {d: [(9, 13), (15, 19)] for d in range(5)} | {5: [(9, 13)]}
CTX_RECEPTION = RequestContext(ip="192.168.1.20", user_agent="Mozilla/5.0 (Windows NT 10.0)")
CTX_DOCTOR = RequestContext(ip="192.168.1.31", user_agent="Mozilla/5.0 (Macintosh)")

ALLERGIES = [
    ("Penicilina", "Urticaria", AllergySeverity.SEVERE),
    ("AINEs (ibuprofeno)", "Broncoespasmo leve", AllergySeverity.MODERATE),
    ("Mariscos", "Prurito y ronchas", AllergySeverity.MILD),
    ("Sulfas", "Erupción cutánea", AllergySeverity.MODERATE),
]
MEDICATIONS = [
    ("Losartán", "50 mg", "1 vez al día"),
    ("Levotiroxina", "50 mcg", "En ayunas"),
    ("Atorvastatina", "20 mg", "Por la noche"),
    ("Omeprazol", "20 mg", "En ayunas"),
    ("Metformina", "850 mg", "c/12 h"),
]
CONDITIONS = [
    ("PERSONAL", "I10", "Hipertensión arterial en tratamiento"),
    ("PERSONAL", "E03.9", "Hipotiroidismo"),
    ("FAMILY", "E11.9", "Madre con diabetes tipo 2"),
    ("SURGICAL", None, "Apendicectomía (2015)"),
    ("HABIT", None, "Sedentarismo"),
    ("HABIT", None, "Café 3 tazas al día"),
]


def set_clock(moment: datetime | None) -> None:
    global _fake_now
    _fake_now = moment


def real_now() -> datetime:
    return _real_utcnow()


def at_lima(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), LIMA).astimezone(UTC)


def ascii_slug(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return plain.lower().replace(" ", "")


# ------------------------------------------------------------------ modelo de la simulación
@dataclass(eq=False)
class Person:
    data: PatientCreate
    raw_phone: str
    source: LeadSource
    via_lead: bool
    sex: str
    patient: Patient | None = None
    history_done: bool = False


@dataclass(eq=False)
class Story:
    """Un ciclo de tratamiento de una persona en una especialidad."""

    person: Person
    specialty: Specialty
    profile: Profile
    sessions: int
    interval: tuple[int, int]
    next_due: date
    done: int = 0
    vas0: int = 7
    weight: float = 80.0
    height: float = 165.0
    future_booked: bool = False

    @property
    def finished(self) -> bool:
        return self.done >= self.sessions


class Calendar:
    """Ocupación en memoria (doctor, paciente, sala) para elegir huecos sin choques."""

    def __init__(self) -> None:
        self._busy: dict[object, list[tuple[datetime, datetime]]] = defaultdict(list)

    def free(self, keys: list[object], start: datetime, end: datetime) -> bool:
        return all(not (s < end and start < e) for k in keys for s, e in self._busy[k])

    def take(self, keys: list[object], start: datetime, end: datetime) -> None:
        for key in keys:
            self._busy[key].append((start, end))


@dataclass
class Ctx:
    session: AsyncSession
    reception: User
    doctors: dict[Specialty, User]
    types: dict[tuple[str, str], AppointmentType]
    rooms: dict[str, Room]
    patients: PatientService
    appointments: AppointmentService
    encounters: EncounterService
    leads: LeadService
    consents: ConsentRepository
    records: ClinicalRecordRepository
    calendar: Calendar
    stamps: dict[str, dict[Any, list[datetime]]]

    def stamp(self, table: str, row_id: Any, moment: datetime) -> None:
        """Primera marca = created_at; la última = updated_at."""
        times = self.stamps[table].setdefault(row_id, [moment, moment])
        times[1] = moment


# ------------------------------------------------------------------------ personas
class PersonFactory:
    def __init__(self) -> None:
        self._documents: set[str] = set()
        self._phones: set[str] = set()
        self._emails: set[str] = set()

    def unique_email(self, first: str, last: str) -> str:
        domain = RNG.choice(["gmail.com", "hotmail.com", "outlook.com"])
        while True:
            email = f"{ascii_slug(first)}.{ascii_slug(last)}{RNG.randint(1, 99)}@{domain}"
            if email not in self._emails:
                self._emails.add(email)
                return email

    def unique_phone(self) -> str:
        while True:
            phone = "9" + "".join(RNG.choices("0123456789", k=8))
            if phone not in self._phones:
                self._phones.add(phone)
                return phone

    def _document(self) -> str:
        while True:
            dni = RNG.choice("4567") + "".join(RNG.choices("0123456789", k=7))
            if dni not in self._documents and not dni.startswith("700000"):
                self._documents.add(dni)
                return dni

    def name(self) -> tuple[str, str, str]:
        sex = "FEMALE" if RNG.random() < 0.65 else "MALE"
        first = RNG.choice(FEMALE_NAMES if sex == "FEMALE" else MALE_NAMES)
        return sex, first, f"{RNG.choice(LAST_NAMES)} {RNG.choice(LAST_NAMES)}"

    def make(self, *, via_lead: bool) -> Person:
        sex, first, last = self.name()
        phone = self.unique_phone()
        email = self.unique_email(first, last.split()[0]) if RNG.random() < 0.7 else None
        contact = None
        if RNG.random() < 0.6:
            contact = {
                "name": " ".join(self.name()[1:]),
                "phone": self.unique_phone(),
                "relation": RNG.choice(RELATIONS),
            }
        source = RNG.choice(LEAD_SOURCES if via_lead else DIRECT_SOURCES)
        data = PatientCreate.model_validate(
            {
                "document_type": "DNI",
                "document_number": self._document(),
                "first_name": first,
                "last_name": last,
                "birth_date": date(RNG.randint(1958, 2003), RNG.randint(1, 12), RNG.randint(1, 28)),
                "sex": sex,
                "marital_status": RNG.choice(["SINGLE", "MARRIED", "COHABITING", "DIVORCED"]),
                "occupation": RNG.choice(OCCUPATIONS),
                "address": f"{RNG.choice(STREETS)} {RNG.randint(100, 2900)}",
                "district": RNG.choice(DISTRICTS),
                "phone": phone,
                "email": email,
                "insurance": RNG.choice(INSURANCES),
                "referral_source": None if via_lead else source.value,
                "emergency_contact": contact,
                "data_processing_consent": True,
            }
        )
        return Person(data=data, raw_phone=phone, source=source, via_lead=via_lead, sex=sex)


def build_stories(factory: PersonFactory, today: date) -> list[Story]:
    first_day = today - timedelta(weeks=HISTORY_WEEKS)
    span = (today + timedelta(days=10) - first_day).days
    stories: list[Story] = []
    for specialty, (count, sessions, interval) in SPECIALTY_PLAN.items():
        for _ in range(count):
            person = factory.make(via_lead=RNG.random() < VIA_LEAD_SHARE)
            start = first_day + timedelta(days=RNG.randint(0, span))
            stories.append(new_story(person, specialty, start, sessions, interval))
    for base in RNG.sample(stories, CROSS_SPECIALTY_STORIES):
        specialty = RNG.choice([s for s in SPECIALTY_PLAN if s != base.specialty])
        _, sessions, interval = SPECIALTY_PLAN[specialty]
        start = base.next_due + timedelta(days=RNG.randint(14, 40))
        stories.append(new_story(base.person, specialty, start, sessions, interval))
    return stories


def new_story(
    person: Person,
    specialty: Specialty,
    start: date,
    sessions: tuple[int, int],
    interval: tuple[int, int],
) -> Story:
    female = person.sex == "FEMALE"
    return Story(
        person=person,
        specialty=specialty,
        profile=RNG.choice(PROFILES[specialty]),
        sessions=RNG.randint(*sessions),
        interval=interval,
        next_due=start,
        vas0=RNG.randint(6, 8),
        weight=RNG.uniform(66, 90) if female else RNG.uniform(80, 104),
        height=round(RNG.uniform(152, 168) if female else RNG.uniform(163, 181), 1),
    )


# ------------------------------------------------------------------------ agenda
def candidate_starts(day: date, minutes: int) -> Iterator[datetime]:
    for start_hour, end_hour in BLOCKS.get(day.weekday(), []):
        slot = datetime.combine(day, time(start_hour), LIMA)
        block_end = datetime.combine(day, time(end_hour), LIMA)
        while slot + timedelta(minutes=minutes) <= block_end:
            yield slot.astimezone(UTC)
            slot += timedelta(minutes=30)


def pick_slot(
    ctx: Ctx, story: Story, day: date, appt_type: AppointmentType
) -> tuple[datetime, Room | None] | None:
    doctor = ctx.doctors[story.specialty]
    duration = timedelta(minutes=appt_type.duration_minutes)
    is_today_or_later = day >= real_now().astimezone(LIMA).date()
    earliest = real_now() + timedelta(minutes=30) if is_today_or_later else None
    options: list[tuple[datetime, Room | None]] = []
    for start in candidate_starts(day, appt_type.duration_minutes):
        if earliest and start < earliest:
            continue
        if not ctx.calendar.free([("doc", doctor.id), story.person], start, start + duration):
            continue
        room = next(
            (
                ctx.rooms[name]
                for name in ROOMS[story.specialty]
                if ctx.calendar.free([("room", ctx.rooms[name].id)], start, start + duration)
            ),
            None,
        )
        options.append((start, room))
    return RNG.choice(options) if options else None


def appointment_type_for(ctx: Ctx, story: Story) -> AppointmentType:
    names = FOLLOW_TYPES[story.specialty]
    name = FIRST_TYPE[story.specialty] if story.done == 0 else names[story.done % len(names)]
    return ctx.types[(story.specialty.value, name)]


async def book(
    ctx: Ctx,
    story: Story,
    start: datetime,
    room: Room | None,
    appt_type: AppointmentType,
    booked_at: datetime,
) -> Appointment:
    await ensure_patient(ctx, story, booked_at - timedelta(minutes=10))
    assert story.person.patient is not None
    registered = ctx.stamps["patients"][story.person.patient.id][0]
    booked_at = max(booked_at, registered + timedelta(minutes=10))
    set_clock(booked_at)
    appointment = await ctx.appointments.create_appointment(
        ctx.reception,
        AppointmentCreate(
            patient_id=story.person.patient.id,
            doctor_user_id=ctx.doctors[story.specialty].id,
            specialty=story.specialty,
            starts_at=start,
            appointment_type_id=appt_type.id,
            room_id=room.id if room else None,
            admin_notes=RNG.choice(ADMIN_NOTES) if RNG.random() < 0.15 else None,
        ),
        CTX_RECEPTION,
    )
    end = start + timedelta(minutes=appt_type.duration_minutes)
    keys: list[object] = [("doc", appointment.doctor_user_id), story.person]
    if room:
        keys.append(("room", room.id))
    ctx.calendar.take(keys, start, end)
    ctx.stamp("appointments", appointment.id, booked_at)
    return appointment


def booking_time(start: datetime, *, latest: datetime) -> datetime:
    local_day = start.astimezone(LIMA).date() - timedelta(days=RNG.randint(1, 7))
    moment = at_lima(local_day, RNG.randint(9, 18), RNG.choice([5, 12, 26, 41, 53]))
    return min(moment, latest - timedelta(minutes=RNG.randint(5, 240)))


async def run_day(ctx: Ctx, stories: list[Story], day: date) -> None:
    if day.weekday() not in BLOCKS:
        return
    for specialty in ctx.doctors:
        capacity = RNG.randint(4, 6) if day.weekday() < 5 else RNG.randint(2, 3)
        due = [
            s
            for s in stories
            if s.specialty == specialty
            and not s.finished
            and not s.future_booked
            and s.next_due <= day
        ]
        due.sort(key=lambda s: s.next_due)
        for story in due[:capacity]:
            appt_type = appointment_type_for(ctx, story)
            slot = pick_slot(ctx, story, day, appt_type)
            if slot is None:
                continue
            start, room = slot
            if start < real_now():
                await past_visit(ctx, story, start, room, appt_type)
            else:
                await future_visit(ctx, story, start, room, appt_type)


async def future_visit(
    ctx: Ctx, story: Story, start: datetime, room: Room | None, appt_type: AppointmentType
) -> None:
    booked_at = booking_time(start, latest=real_now())
    appointment = await book(ctx, story, start, room, appt_type, booked_at)
    story.future_booked = True
    if start - real_now() < timedelta(days=2) and RNG.random() < 0.7:
        moment = max(booked_at + timedelta(minutes=30), real_now() - timedelta(hours=3))
        set_clock(min(moment, real_now()))
        await ctx.appointments.confirm(ctx.reception, appointment.id, CTX_RECEPTION)
        ctx.stamp("appointments", appointment.id, _utcnow())


async def past_visit(
    ctx: Ctx, story: Story, start: datetime, room: Room | None, appt_type: AppointmentType
) -> None:
    booked_at = booking_time(start, latest=start)
    appointment = await book(ctx, story, start, room, appt_type, booked_at)
    day = start.astimezone(LIMA).date()
    confirm_at = start - timedelta(hours=RNG.randint(16, 26))
    if RNG.random() < 0.75 and confirm_at > booked_at:
        await transition(ctx, appointment, confirm_at, "confirm")
    outcome = RNG.random()
    if outcome < 0.06:
        set_clock(max(booked_at + timedelta(hours=1), start - timedelta(hours=4)))
        await ctx.appointments.cancel(
            ctx.reception, appointment.id, RNG.choice(CANCEL_REASONS), CTX_RECEPTION
        )
        ctx.stamp("appointments", appointment.id, _utcnow())
        story.next_due = day + timedelta(days=RNG.randint(2, 5))
    elif outcome < 0.13:
        await transition(ctx, appointment, start + timedelta(minutes=25), "mark_no_show")
        story.next_due = day + timedelta(days=RNG.randint(3, 6))
    else:
        await attend(ctx, story, appointment, appt_type)
        story.next_due = day + timedelta(days=RNG.randint(*story.interval))


async def transition(ctx: Ctx, appointment: Appointment, moment: datetime, action: str) -> None:
    set_clock(moment)
    await getattr(ctx.appointments, action)(ctx.reception, appointment.id, CTX_RECEPTION)
    ctx.stamp("appointments", appointment.id, moment)


# --------------------------------------------------------------------- atención clínica
async def attend(
    ctx: Ctx, story: Story, appointment: Appointment, appt_type: AppointmentType
) -> None:
    start, minutes = appointment.starts_at, appt_type.duration_minutes
    doctor = ctx.doctors[story.specialty]
    await transition(ctx, appointment, start - timedelta(minutes=RNG.randint(3, 12)), "check_in")
    await first_visit_paperwork(ctx, story, start - timedelta(minutes=2))

    set_clock(start + timedelta(minutes=2))
    encounter = await ctx.encounters.create(
        doctor, EncounterCreate(appointment_id=appointment.id), CTX_DOCTOR
    )
    set_clock(start + timedelta(minutes=int(minutes * 0.6)))
    await ctx.encounters.update_draft(doctor, encounter.id, soap(story, start), CTX_DOCTOR)
    signed_at = start + timedelta(minutes=minutes - RNG.randint(1, 4))
    set_clock(signed_at)
    await ctx.encounters.sign(doctor, encounter.id, CTX_DOCTOR)
    ctx.stamp("appointments", appointment.id, signed_at)
    story.done += 1

    addendum_at = signed_at + timedelta(days=1)
    if RNG.random() < 0.04 and addendum_at < real_now():
        set_clock(addendum_at)
        reason, body = RNG.choice(ADDENDA)
        await ctx.encounters.add_addendum(
            doctor, encounter.id, AddendumCreate(reason=reason, text=body), CTX_DOCTOR
        )


async def first_visit_paperwork(ctx: Ctx, story: Story, moment: datetime) -> None:
    """Consentimientos (general + de la especialidad) y antecedentes en la primera atención."""
    patient = story.person.patient
    assert patient is not None
    set_clock(moment)
    valid = await ctx.consents.valid_types(patient.id)
    wanted = [ConsentType.GENERAL_CARE]
    if story.specialty in SPECIALTY_CONSENT:
        wanted.append(SPECIALTY_CONSENT[story.specialty])
    for kind in wanted:
        if kind.value in valid:
            continue
        template = await ctx.consents.latest_template(kind.value)
        if template is None:
            continue
        await ctx.consents.add(
            patient_id=patient.id,
            type=kind.value,
            template_id=template.id,
            text_version=template.version,
            method=ConsentMethod.PAPER_SCANNED.value,
            signed_by_name=patient.full_name,
            signer_relation=None,
            signature_image=None,
            witness_name=None,
            signed_at=moment,
            captured_by=ctx.reception.id,
        )
    if not story.person.history_done:
        await add_background(ctx, patient, ctx.doctors[story.specialty], moment)
        story.person.history_done = True
    await ctx.session.commit()


async def add_background(ctx: Ctx, patient: Patient, doctor: User, moment: datetime) -> None:
    if RNG.random() < 0.3:
        substance, reaction, severity = RNG.choice(ALLERGIES)
        await ctx.records.add_allergy(
            patient_id=patient.id,
            substance=substance,
            reaction=reaction,
            severity=severity.value,
            status=RecordStatus.ACTIVE.value,
            verified_at=moment,
            created_by=doctor.id,
        )
    if RNG.random() < 0.35:
        name, dose, frequency = RNG.choice(MEDICATIONS)
        await ctx.records.add_medication(
            patient_id=patient.id,
            name=name,
            dose=dose,
            route="Oral",
            frequency=frequency,
            status=RecordStatus.ACTIVE.value,
            created_by=doctor.id,
        )
    for kind, code, description in RNG.sample(CONDITIONS, RNG.randint(0, 2)):
        await ctx.records.add_condition(
            patient_id=patient.id,
            kind=kind,
            icd10_code=code,
            description=description,
            active=True,
            created_by=doctor.id,
        )


def soap(story: Story, start: datetime) -> EncounterUpdate:
    profile, session_number = story.profile, story.done + 1
    first, last = story.done == 0, session_number >= story.sessions
    eva = max(1, story.vas0 - round(story.done * 0.9))
    mejora = min(90, 15 * story.done + RNG.randint(0, 10))
    plan = profile.plan if first else profile.control_plan
    if last:
        plan += " Alta del ciclo de tratamiento; control en 1 mes o antes si reaparecen síntomas."
    followup = None if last else start.astimezone(LIMA).date() + timedelta(days=story.interval[0])
    return EncounterUpdate(
        subjective=profile.subjective
        if first
        else profile.control_subjective.format(mejora=mejora, eva=eva),
        objective_notes=profile.objective
        if first
        else "Buen estado general. Sin efectos adversos desde la sesión anterior.",
        assessment_notes=profile.assessment
        if first
        else f"{profile.assessment.split('.')[0]}. Evolución favorable "
        f"(sesión {session_number} de {story.sessions}).",
        plan=plan,
        followup_at=followup,
        history_reviewed=True,
        vitals=vitals(story, start, eva),
        diagnoses=[
            DiagnosisIn(icd10_code=code, is_primary=index == 0)
            for index, code in enumerate(profile.diagnoses)
        ],
    )


def vitals(story: Story, start: datetime, eva: int) -> list[VitalSignsIn]:
    base: dict[str, Any] = {
        "systolic": RNG.randint(104, 134),
        "diastolic": RNG.randint(64, 84),
        "heart_rate": RNG.randint(62, 88),
    }
    if story.specialty == Specialty.NUTRITION:
        if story.done:
            story.weight -= RNG.uniform(0.4, 1.2)
        return [VitalSignsIn(**base, weight_kg=round(story.weight, 1), height_cm=story.height)]
    if story.specialty == Specialty.IV_THERAPY and story.done > 0:  # sesión de infusión
        pre = VitalSignsIn(
            **base,
            context=VitalContext.PRE,
            measured_at=start + timedelta(minutes=4),
            spo2=RNG.randint(96, 99),
            temperature_c=round(RNG.uniform(36.2, 36.8), 1),
        )
        post = VitalSignsIn(
            systolic=base["systolic"] - RNG.randint(0, 6),
            diastolic=base["diastolic"],
            heart_rate=base["heart_rate"] - RNG.randint(0, 6),
            spo2=RNG.randint(97, 99),
            context=VitalContext.POST,
            measured_at=start + timedelta(minutes=50),
        )
        return [pre, post]
    pain = eva if story.profile.tracks_pain else None
    return [VitalSignsIn(**base, pain_vas=pain)]


# ---------------------------------------------------------------- pacientes y CRM
async def ensure_patient(ctx: Ctx, story: Story, moment: datetime) -> None:
    person = story.person
    if person.patient is not None:
        return
    if person.via_lead:
        person.patient = await converted_lead(ctx, story, moment)
    else:
        set_clock(moment)
        person.patient = await ctx.patients.create_patient(
            ctx.reception, person.data, CTX_RECEPTION
        )
    ctx.stamp("patients", person.patient.id, moment)


async def converted_lead(ctx: Ctx, story: Story, moment: datetime) -> Patient:
    person = story.person
    created = moment - timedelta(days=RNG.randint(3, 12), hours=RNG.randint(0, 6))
    lead = await create_lead(
        ctx,
        created,
        person.data.first_name + " " + person.data.last_name,
        person.raw_phone,
        str(person.data.email) if person.data.email else None,
        {story.specialty},
        person.source,
    )
    await lead_activity(
        ctx,
        lead,
        created + timedelta(hours=RNG.randint(1, 20)),
        LeadActivityType.WHATSAPP,
        RNG.choice(CONTACT_NOTES[:3]),
        None,
    )
    await lead_status(
        ctx, lead, created + timedelta(days=1, hours=RNG.randint(1, 20)), LeadStatus.QUALIFIED
    )
    await lead_status(ctx, lead, moment - timedelta(minutes=30), LeadStatus.APPOINTMENT_SET)
    set_clock(moment)
    _, patient_id, _ = await ctx.leads.convert_to_patient(
        ctx.reception, lead.id, LeadConvert(patient=person.data), CTX_RECEPTION
    )
    ctx.stamp("leads", lead.id, moment)
    patient = await PatientRepository(ctx.session).get(patient_id)
    assert patient is not None
    return patient


async def create_lead(
    ctx: Ctx,
    moment: datetime,
    name: str,
    phone: str,
    email: str | None,
    specialties: set[Specialty],
    source: LeadSource,
) -> Lead:
    set_clock(moment)
    main = next(iter(specialties))
    assignee = ctx.doctors[main] if RNG.random() < 0.15 else ctx.reception
    lead = await ctx.leads.create_lead(
        ctx.reception,
        LeadCreate(
            full_name=name,
            phone=phone,
            email=email,
            interest_specialties=specialties,
            source=source,
            consent_marketing=RNG.random() < 0.6,
            assigned_to=assignee.id,
            notes=RNG.choice(LEAD_NOTES[main]),
        ),
        CTX_RECEPTION,
        allow_duplicate=False,
    )
    ctx.stamp("leads", lead.id, moment)
    return lead


async def lead_activity(
    ctx: Ctx,
    lead: Lead,
    moment: datetime,
    kind: LeadActivityType,
    notes: str,
    next_action: datetime | None,
) -> None:
    set_clock(moment)
    await ctx.leads.add_activity(
        ctx.reception,
        lead.id,
        LeadActivityCreate(type=kind, notes=notes, next_action_at=next_action),
        CTX_RECEPTION,
    )
    ctx.stamp("leads", lead.id, moment)


async def lead_status(
    ctx: Ctx, lead: Lead, moment: datetime, status: LeadStatus, reason: str | None = None
) -> None:
    set_clock(moment)
    await ctx.leads.update_lead(
        ctx.reception, lead.id, LeadUpdate(status=status, lost_reason=reason), CTX_RECEPTION
    )
    ctx.stamp("leads", lead.id, moment)


def next_action_time(today: date) -> datetime:
    day = today + timedelta(days=RNG.randint(-2, 4))
    return at_lima(day, RNG.randint(10, 17), RNG.choice([0, 30]))


async def open_leads(ctx: Ctx, factory: PersonFactory) -> int:
    """Leads que no se convirtieron: el embudo del CRM con seguimientos pendientes."""
    now, today = real_now(), real_now().astimezone(LIMA).date()
    total = 0
    for status, count in OPEN_LEAD_PLAN:
        for _ in range(count):
            _, first, last = factory.name()
            specialties = set(RNG.sample(list(Specialty), RNG.choice([1, 1, 2])))
            email = factory.unique_email(first, last.split()[0]) if RNG.random() < 0.4 else None
            if status == "NEW":
                created = now - timedelta(hours=RNG.randint(2, 70))
            else:
                created = now - timedelta(days=RNG.randint(9, 45), hours=RNG.randint(0, 8))
            lead = await create_lead(
                ctx,
                created,
                f"{first} {last}",
                factory.unique_phone(),
                email,
                specialties,
                RNG.choice(LEAD_SOURCES),
            )
            await advance_lead(ctx, lead, LeadStatus(status), created, today)
            total += 1
    return total


async def advance_lead(
    ctx: Ctx, lead: Lead, target: LeadStatus, created: datetime, today: date
) -> None:
    if target == LeadStatus.NEW:
        return
    step = created + timedelta(hours=RNG.randint(1, 20))
    pending = None if target == LeadStatus.LOST else next_action_time(today)
    await lead_activity(
        ctx,
        lead,
        step,
        RNG.choice([LeadActivityType.CALL, LeadActivityType.WHATSAPP]),
        RNG.choice(CONTACT_NOTES),
        pending,
    )
    if target in (LeadStatus.QUALIFIED, LeadStatus.APPOINTMENT_SET):
        step += timedelta(days=RNG.randint(1, 3))
        await lead_status(ctx, lead, step, LeadStatus.QUALIFIED)
    if target == LeadStatus.APPOINTMENT_SET:
        step += timedelta(days=1)
        await lead_status(ctx, lead, step, LeadStatus.APPOINTMENT_SET)
        await lead_activity(
            ctx,
            lead,
            step + timedelta(minutes=5),
            LeadActivityType.NOTE,
            "Agendó evaluación; falta enviar ubicación y requisitos",
            next_action_time(today),
        )
    if target == LeadStatus.LOST:
        step += timedelta(days=RNG.randint(2, 5))
        await lead_activity(ctx, lead, step, LeadActivityType.CALL, "No contestó", None)
        await lead_status(
            ctx,
            lead,
            step + timedelta(days=RNG.randint(1, 3)),
            LeadStatus.LOST,
            RNG.choice(LOST_REASONS),
        )


# ---------------------------------------------------------------------- arranque
async def build_ctx(session: AsyncSession) -> Ctx:
    users = UserRepository(session)
    reception = await users.get_by_email("recepcion@clinica-demo.pe")
    if reception is None:
        sys.exit("Primero ejecute scripts/seed.py")
    audit, uow = AuditService(AuditRepository(session)), UnitOfWork(session)
    patients_repo, care_team = PatientRepository(session), CareTeamRepository(session)
    patient_service = PatientService(
        patients=patients_repo,
        care_team=care_team,
        users=users,
        audit=audit,
        uow=uow,
        settings=get_settings(),
    )
    types_repo, rooms_repo = AppointmentTypeRepository(session), RoomRepository(session)
    access = ClinicalAccess(patients=patients_repo, care_team=care_team, audit=audit, uow=uow)
    return Ctx(
        session=session,
        reception=reception,
        doctors={
            Specialty(s): d
            for d in await users.list_doctors()
            if d.doctor_profile
            for s in d.doctor_profile.specialty_names
        },
        types={(t.specialty, t.name): t for t in await types_repo.list_types()},
        rooms={r.name: r for r in await rooms_repo.list_rooms(only_active=True)},
        patients=patient_service,
        appointments=AppointmentService(
            appointments=AppointmentRepository(session),
            schedules=ScheduleRepository(session),
            rooms=rooms_repo,
            types=types_repo,
            patients=patients_repo,
            care_team=care_team,
            users=users,
            audit=audit,
            uow=uow,
        ),
        encounters=EncounterService(
            encounters=EncounterRepository(session),
            appointments=AppointmentRepository(session),
            consents=ConsentRepository(session),
            records=ClinicalRecordRepository(session),
            access=access,
            uow=uow,
        ),
        leads=LeadService(
            leads=LeadRepository(session),
            patients=patients_repo,
            patient_service=patient_service,
            users=users,
            audit=audit,
            uow=uow,
        ),
        consents=ConsentRepository(session),
        records=ClinicalRecordRepository(session),
        calendar=Calendar(),
        stamps=defaultdict(dict),
    )


async def preload_calendar(ctx: Ctx) -> None:
    """Citas que ya existen (seed base) ocupan su hueco."""
    rows = await ctx.session.execute(
        select(Appointment).where(Appointment.status.not_in(["CANCELLED", "NO_SHOW"]))
    )
    for a in rows.scalars():
        keys: list[object] = [("doc", a.doctor_user_id), ("pat", a.patient_id)]
        if a.room_id:
            keys.append(("room", a.room_id))
        ctx.calendar.take(keys, a.starts_at, a.ends_at)


async def apply_stamps(ctx: Ctx) -> None:
    for table, rows in ctx.stamps.items():
        params = [{"id": row_id, "c": c, "u": u} for row_id, (c, u) in rows.items()]
        await ctx.session.execute(
            text(f"UPDATE {table} SET created_at = :c, updated_at = :u WHERE id = :id"),  # noqa: S608
            params,
        )
    await ctx.session.commit()


async def main() -> None:
    if get_settings().environment == "production":
        sys.exit("Seed bloqueado en producción")
    engine = build_engine()
    async with build_session_factory(engine)() as session:
        if await session.scalar(select(func.count()).select_from(Lead)):
            sys.exit("La demo ya tiene datos de CRM: seed_demo.py ya se ejecutó")
        ctx = await build_ctx(session)
        await preload_calendar(ctx)
        factory = PersonFactory()
        today = real_now().astimezone(LIMA).date()
        stories = build_stories(factory, today)
        day = today - timedelta(weeks=HISTORY_WEEKS)
        while day <= today + timedelta(days=FUTURE_DAYS):
            await run_day(ctx, stories, day)
            day += timedelta(days=1)
        set_clock(None)
        leads = await open_leads(ctx, factory)
        set_clock(None)
        await apply_stamps(ctx)
        done = sum(s.done for s in stories)
        people = sum(1 for p in {s.person for s in stories} if p.patient)
    await engine.dispose()
    print(
        f"Demo lista: {people} pacientes nuevos, {done} atenciones firmadas, "
        f"{len(ctx.stamps['appointments'])} citas y {leads} leads abiertos/perdidos."
    )


if __name__ == "__main__":
    asyncio.run(main())
