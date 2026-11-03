"""Datos clínicos de ejemplo (FICTICIOS): consentimiento general, alergias y medicación.

Lo invoca `scripts/seed.py` después de la agenda. NO crea encuentros firmados: así quien
prueba la app puede ver el flujo completo (abrir encuentro → completar → firmar) desde cero.
Idempotente: no duplica lo que ya existe. Solo para desarrollo (el seed se bloquea en producción).
"""

from seed_agenda import DEMO_PATIENTS  # mismo directorio: scripts/
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain.enums import AllergySeverity, ConsentMethod, ConsentType, RecordStatus
from app.repositories.clinical_records import ClinicalRecordRepository
from app.repositories.consents import ConsentRepository
from app.repositories.patients import PatientRepository
from app.repositories.users import UserRepository

# (documento del paciente demo, sustancia, reacción, severidad)
DEMO_ALLERGIES = [
    ("70000001", "Penicilina", "Urticaria", AllergySeverity.SEVERE),
    ("70000003", "Látex", "Dermatitis de contacto", AllergySeverity.MODERATE),
]
# (documento, medicamento, dosis, frecuencia)
DEMO_MEDICATIONS = [
    ("70000002", "Losartán", "50 mg", "1 vez al día"),
    ("70000004", "Metformina", "850 mg", "c/12 h"),
]


async def seed_clinical(session: AsyncSession) -> int:
    """Crea lo que falte y devuelve cuántos registros nuevos hubo."""
    owner = await UserRepository(session).get_by_email("dueno@clinica-demo.pe")
    if owner is None:
        return 0
    patients = PatientRepository(session)
    consents = ConsentRepository(session)
    records = ClinicalRecordRepository(session)
    template = await consents.latest_template(ConsentType.GENERAL_CARE.value)
    created = 0

    demo = [await patients.get_by_document("DNI", row[0]) for row in DEMO_PATIENTS]
    by_document = {p.document_number: p for p in demo if p is not None}
    for patient in by_document.values():
        if template is not None and ConsentType.GENERAL_CARE.value not in (
            await consents.valid_types(patient.id)
        ):
            await consents.add(
                patient_id=patient.id,
                type=ConsentType.GENERAL_CARE.value,
                template_id=template.id,
                text_version=template.version,
                method=ConsentMethod.PAPER_SCANNED.value,
                signed_by_name=f"{patient.first_name} {patient.last_name}",
                signer_relation=None,
                signature_image=None,
                witness_name=None,
                signed_at=utcnow(),
                captured_by=owner.id,
            )
            created += 1

    for document, substance, reaction, severity in DEMO_ALLERGIES:
        patient = by_document.get(document)
        if patient is None or await records.list_allergies(patient.id, only_active=False):
            continue
        await records.add_allergy(
            patient_id=patient.id,
            substance=substance,
            reaction=reaction,
            severity=severity.value,
            status=RecordStatus.ACTIVE.value,
            verified_at=utcnow(),
            created_by=owner.id,
        )
        created += 1
    for document, name, dose, frequency in DEMO_MEDICATIONS:
        patient = by_document.get(document)
        if patient is None or await records.list_medications(patient.id, only_active=False):
            continue
        await records.add_medication(
            patient_id=patient.id,
            name=name,
            dose=dose,
            route="Oral",
            frequency=frequency,
            status=RecordStatus.ACTIVE.value,
            created_by=owner.id,
        )
        created += 1
    await session.commit()
    return created
