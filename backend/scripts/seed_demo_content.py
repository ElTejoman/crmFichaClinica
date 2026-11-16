"""Contenido FICTICIO para `seed_demo.py`: nombres, perfiles clínicos por especialidad y leads.

Los textos clínicos son ejemplos verosímiles para una demo, no guías de tratamiento.
Los códigos CIE-10 existen en el catálogo cargado por la migración 0005.
"""

from dataclasses import dataclass

from app.domain.enums import ConsentType, LeadSource, Specialty

S = Specialty

FEMALE_NAMES = [
    "Lucía",
    "Valeria",
    "Camila",
    "Daniela",
    "Fiorella",
    "Milagros",
    "Rocío",
    "Patricia",
    "Gabriela",
    "Andrea",
    "Claudia",
    "Mónica",
    "Silvia",
    "Karina",
    "Jimena",
    "Sofía",
    "Elena",
    "Teresa",
    "Verónica",
    "Natalia",
    "Pamela",
    "Diana",
    "Liliana",
    "Carolina",
]
MALE_NAMES = [
    "Carlos",
    "Miguel",
    "Alonso",
    "Diego",
    "Renzo",
    "Javier",
    "Ricardo",
    "Fernando",
    "Gustavo",
    "Raúl",
    "Sebastián",
    "Martín",
    "Óscar",
    "Eduardo",
    "César",
    "Hugo",
]
LAST_NAMES = [
    "García",
    "Rodríguez",
    "Chávez",
    "Ramos",
    "Mendoza",
    "Torres",
    "Huamán",
    "Sánchez",
    "Espinoza",
    "Rojas",
    "Vásquez",
    "Castro",
    "Gutiérrez",
    "Romero",
    "Salazar",
    "Cárdenas",
    "Paredes",
    "Medina",
    "Aguilar",
    "Delgado",
    "Ccori",
    "Mamani",
    "Villanueva",
    "Benavides",
    "Zevallos",
    "Palacios",
    "Cornejo",
    "Valdivia",
    "Ugarte",
    "Málaga",
    "Arana",
    "Tello",
]
DISTRICTS = [
    "Miraflores",
    "San Isidro",
    "Santiago de Surco",
    "La Molina",
    "San Borja",
    "Jesús María",
    "Lince",
    "Magdalena del Mar",
    "Pueblo Libre",
    "Barranco",
    "San Miguel",
    "Surquillo",
]
STREETS = [
    "Av. Arequipa",
    "Av. Benavides",
    "Calle Los Pinos",
    "Av. Javier Prado",
    "Jr. Huiracocha",
    "Av. Primavera",
    "Calle Las Begonias",
    "Av. La Marina",
    "Av. Brasil",
    "Calle Alcanfores",
]
OCCUPATIONS = [
    "Contadora",
    "Ingeniero de sistemas",
    "Docente",
    "Abogada",
    "Administrador",
    "Diseñadora",
    "Comerciante",
    "Enfermera",
    "Arquitecto",
    "Jubilada",
    "Estudiante universitaria",
    "Analista financiero",
    "Chef",
    "Psicóloga",
    "Vendedor",
    "Ama de casa",
]
INSURANCES = [None, None, "Particular", "Rímac EPS", "Pacífico EPS", "Mapfre Salud", "EsSalud"]
RELATIONS = ["Esposo(a)", "Madre", "Padre", "Hijo(a)", "Hermano(a)", "Pareja"]
DIRECT_SOURCES = [
    LeadSource.REFERRAL,
    LeadSource.WALK_IN,
    LeadSource.REFERRAL,
    LeadSource.INSTAGRAM,
    LeadSource.WEB,
    LeadSource.FACEBOOK,
]


@dataclass(frozen=True)
class Profile:
    """Un motivo de consulta típico de la especialidad y cómo evoluciona en controles."""

    diagnoses: tuple[str, ...]  # el primero es el principal
    subjective: str
    objective: str
    assessment: str
    plan: str
    control_subjective: str  # admite {mejora} (porcentaje) y {eva}
    control_plan: str
    tracks_pain: bool = True


PROFILES: dict[Specialty, list[Profile]] = {
    S.ACUPUNCTURE: [
        Profile(
            ("M54.5",),
            "Dolor lumbar de 3 meses de evolución, peor al estar sentada en la oficina. "
            "Irradiación ocasional a glúteo derecho.",
            "Contractura paravertebral lumbar bilateral. Lasègue negativo. Puntos gatillo en "
            "cuadrado lumbar derecho. Pulso tenso, lengua pálida con capa blanca.",
            "Lumbalgia mecánica crónica. Estancamiento de Qi y Sangre en meridiano de Vejiga.",
            "Acupuntura: BL23, BL25, BL40, GB30, GV4. Electroestimulación 20 min. Ciclo de 8 "
            "sesiones semanales. Pausas activas cada hora y calor local.",
            "Refiere mejoría aproximada del {mejora}% desde el inicio. Dolor actual EVA {eva}/10.",
            "Se repite protocolo BL23, BL25, BL40, GB30 con electroestimulación 20 min. "
            "Continúa ejercicios de estiramiento.",
        ),
        Profile(
            ("G44.2", "Z73.3"),
            "Cefalea frontal y occipital casi diaria desde hace 2 meses, asociada a carga "
            "laboral. Usa paracetamol 3-4 veces por semana.",
            "Tensión en trapecios y suboccipitales. Sin focalidad neurológica.",
            "Cefalea tensional asociada a estrés. Ascenso de Yang de Hígado.",
            "Acupuntura: LI4, LR3, GB20, Yintang, Taiyang. 25 min de permanencia. 6 sesiones "
            "semanales. Higiene del sueño y registro de episodios.",
            "Episodios de cefalea reducidos, mejoría del {mejora}%. Intensidad EVA {eva}/10.",
            "Se mantiene LI4, LR3, GB20, Yintang. Se agrega auriculoterapia (Shenmen).",
        ),
        Profile(
            ("G47.0", "F41.1"),
            "Dificultad para conciliar el sueño, despierta 2-3 veces por noche desde hace "
            "4 meses. Ansiedad y palpitaciones ocasionales.",
            "Paciente ansiosa, PA y FC normales. Lengua roja en la punta, pulso rápido y fino.",
            "Insomnio con ansiedad. Deficiencia de Yin de Corazón.",
            "Acupuntura: HT7, PC6, SP6, KI3, Anmian. 6 a 8 sesiones semanales. Evitar pantallas "
            "1 h antes de dormir.",
            "Duerme mejor, mejoría del {mejora}%. Despertares nocturnos menos frecuentes.",
            "Se repiten HT7, PC6, SP6, Anmian. Semillas auriculares en Shenmen para casa.",
            tracks_pain=False,
        ),
        Profile(
            ("M54.2",),
            "Dolor cervical con rigidez matutina, peor tras jornadas largas frente a la "
            "computadora. 6 semanas de evolución.",
            "Limitación de la rotación cervical izquierda. Contractura de trapecio superior.",
            "Cervicalgia mecánica. Obstrucción de Qi en meridianos Shaoyang.",
            "Acupuntura: GB20, GB21, SI3, BL10, Ashi. Ventosas en trapecios. 6 sesiones.",
            "Mejoría del {mejora}% en rango de movimiento. Dolor EVA {eva}/10.",
            "Se repite protocolo con ventosas. Ergonomía del puesto de trabajo revisada.",
        ),
        Profile(
            ("G43.9",),
            "Migraña hemicraneal izquierda 3-4 veces al mes con náuseas y fotofobia.",
            "Examen neurológico normal. Tensión en región cervical alta.",
            "Migraña sin aura. Profilaxis con acupuntura.",
            "Acupuntura profiláctica: GB20, GB8, LR3, SJ5, LI4. 8 sesiones semanales. Diario "
            "de crisis.",
            "Reporta menos crisis este periodo, mejoría del {mejora}%. Intensidad EVA {eva}/10.",
            "Continúa protocolo profiláctico. Revisión del diario de crisis.",
        ),
    ],
    S.NUTRITION: [
        Profile(
            ("E66.0", "Z71.3"),
            "Desea bajar de peso. Aumento de 12 kg en los últimos 2 años. Come fuera de casa "
            "y consume bebidas azucaradas a diario.",
            "Recordatorio de 24 h: 2600 kcal aprox., alto en harinas y azúcares simples. "
            "Actividad física escasa.",
            "Obesidad por exceso calórico. Alta motivación al cambio.",
            "Plan hipocalórico 1600 kcal, distribución en 5 comidas. Eliminar bebidas "
            "azucaradas. Caminata 30 min 5 días a la semana. Control en 2 semanas.",
            "Buena adherencia al plan ({mejora}% de los días). Menos ansiedad por comer.",
            "Se ajusta plan a 1700 kcal y se agregan opciones de almuerzo fuera de casa.",
            tracks_pain=False,
        ),
        Profile(
            ("E78.2",),
            "Derivado por médico internista por colesterol y triglicéridos elevados en "
            "análisis reciente.",
            "Colesterol total 262 mg/dL, TG 310 mg/dL (análisis traído por el paciente). "
            "Consumo frecuente de frituras.",
            "Hiperlipidemia mixta. Requiere modificación dietaria.",
            "Dieta mediterránea adaptada, 2 porciones de pescado azul por semana, avena diaria, "
            "reducir frituras. Nuevo perfil lipídico en 8 semanas.",
            "Cumple el plan la mayoría de días ({mejora}%). Redujo frituras a 1 vez por semana.",
            "Se mantiene plan. Se refuerza lectura de etiquetas y grasas saludables.",
            tracks_pain=False,
        ),
        Profile(
            ("E11.9", "E66.9"),
            "Diabetes tipo 2 diagnosticada hace 1 año, en tratamiento con metformina. Desea "
            "mejorar su alimentación.",
            "HbA1c 7,8% (reciente). Glucosa en ayunas 148 mg/dL. Horarios de comida irregulares.",
            "DM2 con control subóptimo y sobrepeso.",
            "Plan por intercambios, conteo de carbohidratos, 3 comidas y 2 refrigerios. "
            "Registro de glucemias. Control en 2 semanas.",
            "Glucemias en ayunas mejoradas, adherencia del {mejora}%.",
            "Se refuerza conteo de carbohidratos y se ajusta cena.",
            tracks_pain=False,
        ),
        Profile(
            ("K76.0", "E66.9"),
            "Ecografía reciente informa hígado graso. Refiere distensión abdominal posprandial.",
            "Circunferencia abdominal 104 cm. Consumo de alcohol social los fines de semana.",
            "Esteatosis hepática no alcohólica asociada a sobrepeso.",
            "Plan hipocalórico bajo en azúcares y ultraprocesados. Suspender alcohol. "
            "Actividad física aeróbica 150 min por semana.",
            "Menos distensión abdominal. Adherencia del {mejora}%.",
            "Se mantiene plan y se incorporan recetas altas en fibra.",
            tracks_pain=False,
        ),
        Profile(
            ("D50.9",),
            "Cansancio y caída de cabello. Hemoglobina baja en chequeo laboral. Dieta "
            "vegetariana desde hace 3 años.",
            "Hb 10,9 g/dL, ferritina 8 ng/mL (análisis traído). Palidez leve.",
            "Anemia ferropénica por aporte insuficiente.",
            "Plan vegetariano rico en hierro con vitamina C en cada comida. Coordinar "
            "suplementación con médico. Control de Hb en 6 semanas.",
            "Refiere más energía, mejoría del {mejora}%.",
            "Se mantienen combinaciones hierro + vitamina C. Evitar té con las comidas.",
            tracks_pain=False,
        ),
    ],
    S.CHIROPRACTIC: [
        Profile(
            ("M54.4", "M99.0"),
            "Dolor lumbar que baja por la pierna izquierda tras cargar peso hace 3 semanas.",
            "Lasègue positivo a 60° izquierdo. Fijación sacroilíaca izquierda y L4-L5.",
            "Lumbociática izquierda con disfunción segmentaria lumbosacra.",
            "Ajuste diversificado L4-L5 y sacroilíaca. Ejercicios de McKenzie. 6 sesiones, "
            "2 por semana las primeras 2 semanas.",
            "Dolor irradiado disminuido, mejoría del {mejora}%. EVA {eva}/10.",
            "Ajuste lumbosacro y movilización de cadera. Progresión de ejercicios.",
        ),
        Profile(
            ("M54.2", "M99.0"),
            "Dolor cervical y entre los hombros, trabaja 9 h en laptop. Cefalea al final del día.",
            "Hiperlordosis cervical, protracción de hombros. Fijación C5-C6 y T4.",
            "Cervicalgia postural con disfunción segmentaria cervicodorsal.",
            "Ajuste cervical y dorsal. Ejercicios de retracción cervical. 6 sesiones.",
            "Mejoría del {mejora}% en dolor y rigidez. EVA {eva}/10.",
            "Ajuste C5-C6 y T4. Revisión de ergonomía y pausas activas.",
        ),
        Profile(
            ("M41.9",),
            "Escoliosis conocida desde la adolescencia. Dolor dorsal al final del día.",
            "Curva dorsal derecha leve. Asimetría escapular. Fijación T6-T8.",
            "Escoliosis idiopática leve con dolor mecánico dorsal.",
            "Ajustes dorsales, fortalecimiento de core y estiramientos. 8 sesiones.",
            "Menos dolor dorsal, mejoría del {mejora}%. EVA {eva}/10.",
            "Ajuste dorsal y progresión de ejercicios de core.",
        ),
        Profile(
            ("S33.5",),
            "Dolor lumbar agudo tras partido de fulbito hace 10 días.",
            "Espasmo paravertebral lumbar. Flexión limitada. Sin signos neurológicos.",
            "Esguince lumbar con espasmo muscular.",
            "Terapia de tejidos blandos y ajuste lumbar suave. Hielo las primeras 48 h. "
            "5 sesiones.",
            "Evolución favorable, mejoría del {mejora}%. EVA {eva}/10.",
            "Ajuste lumbar y retorno progresivo a la actividad deportiva.",
        ),
        Profile(
            ("M43.6",),
            "Amaneció con el cuello rígido y no puede girar a la derecha.",
            "Rotación derecha limitada a 30°. Espasmo de esternocleidomastoideo derecho.",
            "Tortícolis aguda.",
            "Técnica de energía muscular y ajuste cervical suave. Calor local. 4 sesiones.",
            "Recupera movilidad, mejoría del {mejora}%. EVA {eva}/10.",
            "Ajuste cervical y estiramientos domiciliarios.",
        ),
    ],
    S.IV_THERAPY: [
        Profile(
            ("E55.9", "R53"),
            "Fatiga persistente. Vitamina D en 14 ng/mL en análisis de hace 1 mes.",
            "Paciente orientada, buen estado general. Accesos venosos adecuados en antebrazo.",
            "Deficiencia de vitamina D con fatiga. Apta para sueroterapia.",
            "Sueroterapia: complejo B + vitamina C 500 mL en 45 min. 4 sesiones semanales. "
            "Coordinar suplementación oral de vitamina D.",
            "Refiere más energía, mejoría del {mejora}%. Sin reacciones en la sesión anterior.",
            "Se repite infusión de complejo B + vitamina C. Tolerancia adecuada.",
            tracks_pain=False,
        ),
        Profile(
            ("E86",),
            "Deshidratación tras cuadro diarreico resuelto. Maratonista, entrena para los 42K.",
            "Mucosas semisecas. Sin fiebre. Tolera vía oral.",
            "Depleción de volumen leve. Recuperación deportiva.",
            "Hidratación IV con electrolitos 1000 mL en 60 min. Sesiones según carga de "
            "entrenamiento.",
            "Buena recuperación entre entrenamientos ({mejora}%).",
            "Hidratación IV con electrolitos. Monitoreo de PA pre y post.",
            tracks_pain=False,
        ),
        Profile(
            ("E61.1", "R53"),
            "Cansancio y dificultad para concentrarse. Ferritina baja; no tolera el hierro oral.",
            "Palidez leve. Accesos venosos adecuados.",
            "Deficiencia de hierro con intolerancia a la vía oral.",
            "Sueroterapia de soporte con vitaminas y minerales. 4 sesiones. Coordinar "
            "con hematología.",
            "Mejor ánimo y concentración, mejoría del {mejora}%.",
            "Se repite infusión. Sin eventos adversos.",
            tracks_pain=False,
        ),
        Profile(
            ("Z73.3", "R53"),
            "Estrés laboral alto, duerme 5 h por noche. Busca recuperar energía.",
            "Buen estado general. PA normal.",
            "Estrés con fatiga. Apta para sueroterapia de soporte.",
            "Sueroterapia con magnesio y complejo B. 4 sesiones cada 10 días. Higiene del sueño.",
            "Refiere sentirse más descansada, mejoría del {mejora}%.",
            "Se repite infusión con magnesio. Tolerancia adecuada.",
            tracks_pain=False,
        ),
    ],
    S.DENTISTRY: [
        Profile(
            ("K02.1", "Z01.2"),
            "Sensibilidad al frío en molares inferiores derechos desde hace 1 mes.",
            "Caries de dentina en piezas 4.6 y 4.7. Radiografía periapical sin compromiso pulpar.",
            "Caries de dentina en 4.6 y 4.7.",
            "Restauraciones con resina en 4.6 y 4.7. Profilaxis y fluorización. Técnica de "
            "cepillado.",
            "Sin sensibilidad en piezas tratadas. Satisfacción del {mejora}%.",
            "Restauración de pieza pendiente. Control en 6 meses.",
            tracks_pain=False,
        ),
        Profile(
            ("K05.1",),
            "Sangrado de encías al cepillarse desde hace varios meses.",
            "Inflamación gingival generalizada, sangrado al sondaje, sarro supragingival.",
            "Gingivitis crónica asociada a placa.",
            "Destartraje y profilaxis. Enseñanza de uso de hilo dental. Control en 2 semanas.",
            "Menos sangrado gingival, mejoría del {mejora}%.",
            "Pulido y refuerzo de higiene. Control en 6 meses.",
            tracks_pain=False,
        ),
        Profile(
            ("K04.0",),
            "Dolor espontáneo e intenso en pieza 3.6, peor por la noche.",
            "Caries profunda en 3.6 con respuesta prolongada al frío. Percusión positiva.",
            "Pulpitis irreversible en 3.6.",
            "Tratamiento de conductos en 3.6 en 2 citas y luego corona. Analgesia indicada.",
            "Sin dolor tras la primera fase del tratamiento ({mejora}% de mejoría).",
            "Obturación de conductos en 3.6. Pendiente corona.",
            tracks_pain=False,
        ),
        Profile(
            ("K05.3",),
            "Movilidad dental y mal aliento. Fumador.",
            "Bolsas periodontales de 5-6 mm en sector posterior. Pérdida ósea horizontal "
            "en radiografía.",
            "Periodontitis crónica moderada.",
            "Raspado y alisado radicular por cuadrantes (4 citas). Consejería antitabaco.",
            "Menos sangrado y halitosis, mejoría del {mejora}%.",
            "Raspado del siguiente cuadrante. Refuerzo de higiene.",
            tracks_pain=False,
        ),
        Profile(
            ("K07.6",),
            "Dolor en la mandíbula al masticar y chasquido al abrir la boca. Aprieta los "
            "dientes al dormir.",
            "Chasquido en ATM derecha, desgaste en bordes incisales.",
            "Trastorno temporomandibular con bruxismo.",
            "Placa miorrelajante nocturna. Dieta blanda y calor local. Control en 2 semanas.",
            "Menos dolor mandibular, mejoría del {mejora}%.",
            "Ajuste de placa miorrelajante.",
            tracks_pain=False,
        ),
    ],
}

# Cuántos pacientes nuevos por especialidad, sesiones del ciclo y días entre sesiones.
SPECIALTY_PLAN: dict[Specialty, tuple[int, tuple[int, int], tuple[int, int]]] = {
    S.ACUPUNCTURE: (15, (6, 10), (6, 8)),
    S.NUTRITION: (13, (4, 6), (12, 16)),
    S.CHIROPRACTIC: (13, (5, 8), (5, 8)),
    S.IV_THERAPY: (9, (3, 5), (7, 12)),
    S.DENTISTRY: (10, (3, 5), (7, 14)),
}
FIRST_TYPE = {
    S.ACUPUNCTURE: "Primera consulta",
    S.NUTRITION: "Primera consulta",
    S.CHIROPRACTIC: "Primera consulta",
    S.IV_THERAPY: "Evaluación previa",
    S.DENTISTRY: "Primera consulta",
}
FOLLOW_TYPES = {
    S.ACUPUNCTURE: ("Sesión de control",),
    S.NUTRITION: ("Control",),
    S.CHIROPRACTIC: ("Ajuste",),
    S.IV_THERAPY: ("Sesión de sueroterapia",),
    S.DENTISTRY: ("Procedimiento", "Procedimiento", "Control"),
}
ROOMS = {
    S.ACUPUNCTURE: ("Consultorio 2", "Consultorio 1"),
    S.CHIROPRACTIC: ("Consultorio 2", "Consultorio 1"),
    S.NUTRITION: ("Consultorio de nutrición", "Consultorio 1"),
    S.IV_THERAPY: ("Sala de sueroterapia",),
    S.DENTISTRY: ("Consultorio dental",),
}
SPECIALTY_CONSENT = {
    S.ACUPUNCTURE: ConsentType.ACUPUNCTURE_INVASIVE,
    S.CHIROPRACTIC: ConsentType.CHIROPRACTIC_MANIPULATION,
    S.IV_THERAPY: ConsentType.IV_THERAPY,
    S.DENTISTRY: ConsentType.DENTAL_PROCEDURE,
}

ADMIN_NOTES = [
    "Prefiere recordatorio por WhatsApp",
    "Traerá resultados de laboratorio",
    "Llegar 10 min antes para completar ficha",
    "Pagó por adelantado (transferencia)",
    "Viene acompañada de su hija",
]
CANCEL_REASONS = [
    "Paciente reprograma por trabajo",
    "Viaje imprevisto",
    "Se encuentra con resfrío",
    "Cruce con otra cita médica",
]
ADDENDA = [
    (
        "Resultado de laboratorio",
        "Paciente envió resultados por correo; se adjuntan a la historia. Sin cambios en el plan.",
    ),
    ("Corrección de dato", "En el plan, la frecuencia correcta de controles es cada 2 semanas."),
    (
        "Llamada de seguimiento",
        "Se llamó a la paciente al día siguiente: buena tolerancia, sin molestias.",
    ),
]

LEAD_NOTES: dict[Specialty, list[str]] = {
    S.ACUPUNCTURE: [
        "Consulta por paquete de 8 sesiones para dolor de espalda",
        "Pregunta si la acupuntura ayuda con el estrés",
    ],
    S.NUTRITION: [
        "Quiere plan para bajar de peso antes de su matrimonio",
        "Pregunta por planes para deportistas",
    ],
    S.CHIROPRACTIC: [
        "Pregunta precio de evaluación quiropráctica",
        "Le recomendó una amiga para dolor de cuello",
    ],
    S.IV_THERAPY: [
        "Consulta por sueroterapia de vitaminas",
        "Pregunta si aceptan su EPS para sueroterapia",
    ],
    S.DENTISTRY: [
        "Pide presupuesto de limpieza y blanqueamiento",
        "Consulta por ortodoncia para su hijo",
    ],
}
CONTACT_NOTES = [
    "Se envió tarifario por WhatsApp",
    "Interesada, pidió horarios del sábado",
    "Llamada: comparará con otra clínica y responde esta semana",
    "No contestó, se deja mensaje",
    "Pidió que la llamen después de su quincena",
]
LOST_REASONS = [
    "Precio fuera de su presupuesto",
    "Eligió otra clínica más cerca",
    "No respondió tras 3 intentos",
    "Horario no compatible",
]
LEAD_SOURCES = [
    LeadSource.INSTAGRAM,
    LeadSource.INSTAGRAM,
    LeadSource.FACEBOOK,
    LeadSource.WEB,
    LeadSource.REFERRAL,
    LeadSource.WALK_IN,
]
# (estado final del lead, cantidad) para los leads que NO se convierten en pacientes.
OPEN_LEAD_PLAN = [
    ("NEW", 5),
    ("CONTACTED", 7),
    ("QUALIFIED", 5),
    ("APPOINTMENT_SET", 3),
    ("LOST", 8),
]
