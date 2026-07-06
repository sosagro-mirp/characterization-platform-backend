import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { DataSource, EntityManager } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignStep } from 'src/campaigns/entities/campaign-step.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { Cooperative } from 'src/cooperatives/entities/cooperative.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Device } from 'src/devices/entities/device.entity';
import { DigitalFuncionality } from 'src/digital-funcionality/entities/digital-funcionality.entity';
import { FarmerConnection } from 'src/farmers-connections/entities/farmer-connection.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Institution } from 'src/institutions/entities/institution.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Laboratory } from 'src/laboratories/entities/laboratory.entity';
import { Objective } from 'src/objectives/entities/objective.entity';
import { Obstacle } from 'src/obstacles/entities/obstacle.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Technology } from 'src/technologies/entities/technology.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfConnection } from 'src/types-of-connections/entities/type-of-connection.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { TypeOfInstitution } from 'src/types-of-institutions/entities/type-of-institution.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { User } from 'src/users/entities/user.entity';
import { MediaAttachment } from 'src/media-attachments/entities/media-attachment.entity';

const ALL_ENTITIES = [
  ActorType,
  MediaAttachment,
  Campaign,
  CampaignSession,
  CampaignStep,
  StepCondition,
  Cooperative,
  Department,
  Device,
  DigitalFuncionality,
  Farm,
  Farmer,
  FarmerConnection,
  Institution,
  Instrument,
  Laboratory,
  Objective,
  Obstacle,
  OptionQuestion,
  Question,
  Response,
  Role,
  Section,
  Survey,
  Technology,
  Town,
  TypeOfConnection,
  TypeOfCrop,
  TypeOfInstitution,
  TypeOfQuestion,
  User,
];

const SYSTEM_FIELD = 'Pregunta estratégica de caracterización tecnológica';

const LIKERT_OPTIONS = [
  { text: 'Totalmente de acuerdo', value: 5 },
  { text: 'De acuerdo', value: 4 },
  { text: 'Ni de acuerdo ni en desacuerdo', value: 3 },
  { text: 'En desacuerdo', value: 2 },
  { text: 'Totalmente en desacuerdo', value: 1 },
];

// Questions per instrument: [instrumentName, sectionOrder (0=last), questions[]]
// sectionOrder: -1 = last section by max order
const INSTRUMENT_QUESTIONS: Array<{ name: string; questions: string[] }> = [
  {
    name: 'S3: Manejo del Cultivo, Suelo y Condiciones Ambientales',
    questions: [
      'Me sería útil recibir en mi celular una alerta cuando sea el momento recomendado para hacer un nuevo análisis de suelo, según el intervalo que yo mismo defina.',
      'Me sería útil una app que interpretara los resultados de mi análisis de suelo y me sugiriera ajustes en la fertilización de forma sencilla, sin necesidad de un técnico presente.',
      'Me gustaría llevar un registro digital de los fertilizantes que aplico (producto, dosis, fecha) para comparar con los resultados productivos al final de la campaña.',
      'Me sería útil que una herramienta digital me indicara qué fertilizantes son compatibles con las certificaciones que busco (orgánico, Rainforest Alliance, etc.).',
    ],
  },
  {
    name: 'S3.4.1: Susceptibilidad a Enfermedades',
    questions: [
      'Me sería útil contar con una guía digital con fotografías y criterios visuales para identificar en campo el nivel de susceptibilidad a enfermedades de cada clon de cacao que evalúe.',
      'Me gustaría acceder desde mi celular a una base de datos de clones de cacao con sus perfiles de resistencia documentados, para comparar con lo que observo en campo.',
      'Me sería útil una app que registrara automáticamente las evaluaciones de susceptibilidad por árbol y generara un reporte del estado sanitario del lote al finalizar el recorrido.',
      'Consultaría información técnica sobre resistencia varietal de cacao en una plataforma digital durante mis visitas de campo.',
    ],
  },
  {
    name: 'S3B: Caracterización Morfológica Cacao (Técnicos)',
    questions: [
      'Me sería útil contar con una app que me guiara paso a paso por las mediciones morfológicas del árbol de cacao con campos de captura directamente en el celular, sin necesidad de papel.',
      'Me gustaría que la app me permitiera tomar fotografías de cada parte del árbol y las asociara automáticamente al árbol evaluado, con georreferencia y número de árbol.',
      'Me sería útil una función que, al ingresar las mediciones morfológicas, comparara el árbol con el perfil típico de un clon de referencia y estimara su identidad varietal.',
      'Me sería útil que la plataforma generara un informe de caracterización morfológica por finca de forma automática al terminar de evaluar todos los árboles del lote.',
    ],
  },
  {
    name: 'S4.1: Poscosecha Cacao',
    questions: [
      'Me sería útil recibir en mi celular una alerta cuando el tiempo de fermentación configurado haya terminado, para evitar sobre-procesamiento del cacao.',
      'Me gustaría registrar en una app los parámetros de secado de cacao (temperatura, tiempo, humedad final) de cada lote, para comparar y mejorar de lote a lote.',
      'Me sería útil tener disponible en una aplicación tablas de referencia de humedad y tiempo de fermentación, y tutoriales de buenas prácticas de poscosecha de cacao.',
      'Me sería útil que la app me mostrara el precio de mercado actualizado del cacao seco para negociar mejor con el comprador.',
      'Me gustaría llevar un registro digital de cada venta de cacao realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.',
    ],
  },
  {
    name: 'S4.2: Poscosecha Café',
    questions: [
      'Me sería útil recibir en mi celular una alerta cuando el tiempo de beneficio o fermentación del café configurado haya terminado, para evitar sobre-fermentación.',
      'Me gustaría registrar en una app los parámetros de secado del café (temperatura, tiempo, humedad final del pergamino) de cada lote, para mejorar proceso a proceso.',
      'Me sería útil tener en una aplicación tablas de referencia de humedad óptima del café pergamino seco y tutoriales de buenas prácticas de beneficio.',
      'Me sería útil que la app me mostrara el precio de referencia del café pergamino seco actualizado para negociar mejor con compradores o intermediarios.',
      'Me gustaría llevar un registro digital de cada venta de café realizada (cantidad, precio, comprador) para consultar mi historial de comercialización sin depender de anotaciones en papel.',
    ],
  },
  {
    name: 'S4.3: Poscosecha Cannabis',
    questions: [
      'Me sería útil recibir en mi celular una alerta cuando el tiempo de curado del cannabis configurado haya terminado, para evitar sobre-procesamiento de la flor.',
      'Me gustaría registrar en una app los parámetros de secado de cannabis (temperatura, humedad relativa, días) de cada lote, para mejorar ciclo a ciclo.',
      'Me sería útil tener en una aplicación tablas de referencia de humedad óptima de la flor seca y buenas prácticas INVIMA para la poscosecha de cannabis.',
      'Me sería útil que la app me mostrara el precio de mercado actualizado de la flor seca de cannabis para negociar mejor con los compradores.',
      'Me gustaría llevar un registro digital de cada venta de cannabis realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.',
    ],
  },
  {
    name: 'S4.4: Poscosecha Cáñamo',
    questions: [
      'Me sería útil recibir en mi celular una alerta cuando el proceso de secado de cáñamo configurado haya terminado, para evitar deterioro del producto.',
      'Me gustaría registrar en una app los parámetros de secado de fibra, semilla o flor de cáñamo por lote, para mejorar el proceso ciclo a ciclo.',
      'Me sería útil que la app me indicara el precio de mercado actualizado de la fibra, semilla o CBD de cáñamo para negociar mejor con los compradores.',
      'Me gustaría llevar un registro digital de cada venta de cáñamo realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.',
    ],
  },
  {
    name: 'S4.5: Energía y Equipos',
    questions: [
      'Me gustaría llevar en una app un inventario de mis equipos productivos (nombre, año de compra, estado) para tener un registro organizado y saber cuándo programar mantenimiento.',
      'Me sería útil recibir alertas de mantenimiento preventivo de mis equipos (secadoras, calderas) a través de mi celular, según el ciclo de uso que yo defina.',
      'Me sería útil una herramienta que me calculara el costo energético estimado de cada ciclo de procesamiento por tipo de combustible, para identificar dónde puedo ahorrar.',
      'Me interesaría recibir información sobre equipos más eficientes disponibles en el mercado colombiano a través de una plataforma digital.',
    ],
  },
  {
    name: 'S5: Dificultades para Cumplir Estándares de Calidad',
    questions: [
      'Me sería útil contar con una guía digital en mi celular que me explicara de forma sencilla las normas de calidad aplicables a mi cultivo, con ejemplos prácticos.',
      'Me sería útil una app que me ayudara a comparar los parámetros de calidad de mi producción con los estándares requeridos por los compradores, para saber cuánto me falta.',
      'Me gustaría que una herramienta digital me conectara con laboratorios de análisis de calidad cercanos a mi zona, con sus tarifas y tiempos de respuesta.',
      'Me sería útil recibir una alerta digital si el precio diferencial por calidad en mi mercado cambia significativamente, para decidir si vale la pena invertir en mejorar mi proceso.',
      'Consultaría frecuentemente una herramienta digital para hacer seguimiento a los requisitos de certificaciones que me interesan (Rainforest Alliance, Fair Trade, orgánico).',
    ],
  },
  {
    name: 'S6A: Generación y Manejo de Residuos — Cacao',
    questions: [
      'Me sería útil una app que me mostrara opciones de valorización para los residuos de cacao que genero (cáscara de mazorca, mucílago, aguas mieles), con instrucciones paso a paso para implementarlas.',
      'Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de cacao.',
      'Me sería útil llevar en una app un registro de las cantidades de residuos de cacao que genero por cosecha, para estimar su potencial de valorización y acceder a incentivos ambientales.',
      'Preferiría recibir guías de manejo de residuos de cacao en formato de video corto o audio, para usarlas mientras trabajo.',
    ],
  },
  {
    name: 'S6B: Generación y Manejo de Residuos — Café',
    questions: [
      'Me sería útil una app que me mostrara opciones de valorización para los residuos de café que genero (pulpa, mucílago, aguas mieles), con instrucciones paso a paso para implementarlas.',
      'Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de café.',
      'Me sería útil llevar en una app un registro de las cantidades de residuos de café que genero por cosecha, para estimar su potencial de valorización y acceder a incentivos ambientales.',
      'Preferiría recibir guías de manejo de residuos de café en formato de video corto o audio, para usarlas mientras trabajo.',
    ],
  },
  {
    name: 'S6C: Generación y Manejo de Residuos — Cannabis',
    questions: [
      'Me sería útil una app que me mostrara opciones de valorización para los residuos de cannabis que genero (tallos, hojas de descarte, bagazo de extracción), con instrucciones paso a paso.',
      'Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de cannabis.',
      'Me sería útil llevar en una app un registro de las cantidades de residuos de cannabis que genero por ciclo, para estimar su potencial de valorización y acceder a incentivos ambientales.',
      'Preferiría recibir guías de manejo de residuos de cannabis en formato de video corto o audio, para usarlas mientras trabajo.',
    ],
  },
  {
    name: 'S6D: Generación y Manejo de Residuos — Cáñamo',
    questions: [
      'Me sería útil una app que me mostrara opciones de valorización para los subproductos de cáñamo que genero (residuos del desfibrado, residuos de extracción de CBD), con instrucciones paso a paso.',
      'Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de cáñamo.',
      'Me sería útil llevar en una app un registro de las cantidades de residuos de cáñamo que genero por ciclo, para estimar su potencial de valorización.',
      'Preferiría recibir guías de manejo de residuos de cáñamo en formato de video corto o audio, para usarlas mientras trabajo.',
    ],
  },
  {
    name: 'S7A: Agua en el Cultivo de Cacao',
    questions: [
      'Me sería útil recibir en mi celular alertas cuando los parámetros del agua (pH, turbidez) estén fuera del rango óptimo para el cultivo de cacao.',
      'Me gustaría llevar en una app un registro del volumen de agua que uso por ciclo de fermentación y lavado de cacao, para detectar tendencias de consumo y reducir costos.',
      'Me sería útil una herramienta que me indicara qué tratamiento de agua aplicar según el resultado del análisis que reporto, para cumplir con las exigencias del proceso de beneficio.',
      'Me gustaría recibir recomendaciones digitales sobre cómo reducir el volumen de aguas mieles o lixiviados generados en el beneficio de cacao, para cumplir con regulaciones ambientales.',
    ],
  },
  {
    name: 'S7B: Agua en el Cultivo de Café',
    questions: [
      'Me sería útil recibir en mi celular alertas cuando los parámetros del agua (pH, turbidez) estén fuera del rango óptimo para el beneficio de café.',
      'Me gustaría llevar en una app un registro del volumen de agua que uso por ciclo de despulpado, fermentación y lavado de café, para detectar consumos y reducir costos.',
      'Me sería útil una herramienta que me indicara qué tratamiento de agua aplicar según el resultado del análisis de pH y turbidez que reporto.',
      'Me gustaría recibir recomendaciones digitales sobre cómo reducir el volumen de aguas mieles generadas en el beneficio de café, para cumplir con regulaciones ambientales.',
    ],
  },
  {
    name: 'S7C: Agua en Cannabis y Cáñamo',
    questions: [
      'Me sería útil recibir en mi celular alertas cuando los parámetros del agua de riego (pH, conductividad eléctrica, temperatura) estén fuera del rango óptimo para mi cultivo.',
      'Me gustaría llevar en una app un registro del volumen de agua que uso por ciclo de riego o fertirriego, para detectar tendencias de consumo y reducir costos.',
      'Me sería útil una herramienta que me indicara qué ajustes de fertilización o tratamiento de agua aplicar según los parámetros que mido en campo.',
      'Me gustaría recibir recomendaciones digitales sobre cómo gestionar el vertimiento de aguas residuales de mi cultivo para cumplir con las regulaciones ambientales colombianas.',
    ],
  },
  {
    name: 'S8A: Infraestructura de Poscosecha Cacao',
    questions: [
      'Me sería útil contar con un inventario digital de mi infraestructura de poscosecha de cacao (cajones, marquesinas, secadores, básculas), al que pueda acceder desde el celular para gestionar apoyos de mejora.',
      'Me gustaría recibir alertas de mantenimiento de mis equipos de poscosecha de cacao según el ciclo de uso que yo mismo registre.',
      'Me sería útil una guía digital que me indicara las especificaciones técnicas ideales de infraestructura de poscosecha de cacao para cumplir estándares NTC 1252.',
      'Me sería útil que una app me calculara cuánto cacao puedo procesar por ciclo con mi infraestructura actual, para planear mejor la cosecha.',
    ],
  },
  {
    name: 'S8B: Infraestructura de Poscosecha Café',
    questions: [
      'Me sería útil contar con un inventario digital de mi infraestructura de beneficio de café (beneficiadero, despulpadora, marquesinas, bodega), al que pueda acceder desde el celular para gestionar apoyos de mejora.',
      'Me gustaría recibir alertas de mantenimiento de mis equipos de beneficio de café según el ciclo de uso que yo mismo registre.',
      'Me sería útil una guía digital que me indicara las especificaciones técnicas ideales de infraestructura de beneficio de café para cumplir estándares NTC 2090.',
      'Me sería útil que una app me calculara cuánto café puedo beneficiar por ciclo con mi infraestructura actual, para planear mejor la cosecha.',
    ],
  },
  {
    name: 'S8C: Infraestructura de Producción Cannabis',
    questions: [
      'Me sería útil una app que monitoree en tiempo real la temperatura y humedad relativa de mi cuarto de cultivo de cannabis y me envíe alertas cuando estén fuera del rango configurado.',
      'Me gustaría controlar desde mi celular el sistema de fotoperiodo o los extractores de ventilación de mi invernadero de cannabis mediante una aplicación.',
      'Me sería útil llevar un registro digital de los parámetros de mi cuarto de secado de cannabis (temperatura, humedad, días) por cada lote, para mejorar el proceso ciclo a ciclo.',
      'Me interesaría recibir recomendaciones digitales sobre cómo optimizar mi sistema de riego o extracción de CBD según los parámetros productivos que registre.',
    ],
  },
  {
    name: 'S8D: Infraestructura de Producción Cáñamo',
    questions: [
      'Me sería útil una app que monitoree en tiempo real las condiciones de almacenamiento de mi cáñamo (temperatura, humedad) y me envíe alertas cuando estén fuera del rango configurado.',
      'Me gustaría llevar un registro digital de los parámetros de secado de fibra, semilla o flor de cáñamo por lote, para mejorar el proceso ciclo a ciclo.',
      'Me sería útil una herramienta digital que me ayudara a calcular la capacidad de procesamiento de mi decorticadora o equipo de extracción de CBD, para planear mejor la cosecha.',
      'Me interesaría recibir recomendaciones digitales sobre cómo optimizar el procesamiento de cáñamo según los parámetros de mi infraestructura actual.',
    ],
  },
  {
    name: 'S8E: Servicios e Infraestructura General',
    questions: [
      'Si existiera una aplicación gratuita diseñada específicamente para agricultores de mi cultivo, la descargaría y la usaría activamente.',
      'Estaría dispuesto(a) a dedicarle entre 5 y 15 minutos diarios a una app de gestión de finca si eso me ayuda a mejorar mi producción o mis ingresos.',
      'Me gustaría que la app pudiera usarse sin internet y sincronizara la información cuando recuperara señal, para no perder datos en zonas sin cobertura.',
      'Preferiría una app que funcione tanto en celular como en computador o tablet, para usarla donde sea más cómodo para mí.',
      'Confiaría en una app de gestión de finca si la recomienda mi extensionista o si la usan otros productores de mi zona que conozco.',
    ],
  },
  {
    name: 'S9: Asociatividad y Canales de Comercialización',
    questions: [
      'Me sería útil recibir en mi celular el precio de mercado actualizado de mi producto (por tipo y calidad) al menos una vez por semana, para negociar mejor con intermediarios o asociaciones.',
      'Me gustaría que una plataforma digital me mostrara los requisitos que debo cumplir para vender directamente a compradores de mayor valor (exportadores, industria, tiendas especializadas).',
      'Me sería útil una función que me permitiera comunicarme con otros productores de mi cultivo y zona para coordinar volúmenes de venta conjunta o acceder a mejores precios.',
      'Actualizaría frecuentemente en una plataforma digital la información sobre mi producción disponible para la venta, si eso me conecta con mejores compradores.',
    ],
  },
  {
    name: 'S10: Interés en Participar en el Proyecto',
    questions: [
      'Preferiría recibir la capacitación en el uso de la app del proyecto en formato de taller presencial con práctica, en lugar de solo un video o manual.',
      'La prioridad que le daría a la plataforma digital del proyecto es que me ayude a mejorar el registro y seguimiento de mi producción.',
      'Estaría dispuesto(a) a compartir datos de producción de mi finca con el equipo del proyecto a través de una app, si eso me permite recibir recomendaciones técnicas personalizadas a cambio.',
      'Me gustaría participar en pruebas de la app antes de que esté lista para todos los productores, para dar mi opinión sobre si es fácil de usar y útil para mi realidad.',
    ],
  },
  {
    name: 'S11: Adopción Tecnológica — Diagnóstico de Barreras',
    questions: [
      'De las posibles funciones de una app agrícola, el registro de producción y el acceso a precios de mercado serían las más valiosas para mí.',
      'Estaría dispuesto(a) a invertir al menos una sesión de capacitación para aprender a usar una nueva app agrícola, si veo resultados concretos rápidamente.',
      'Confiaría más en una app para gestionar mi finca si la recomienda mi extensionista o si está respaldada por una entidad que conozco.',
      'Usaría una app aunque al inicio me resultara difícil de manejar, si me demuestra que puede aumentar mis ingresos aplicando sus recomendaciones.',
    ],
  },
  {
    name: 'S11: Adopción Tecnológica — Diagnóstico Extensionistas',
    questions: [
      'Me sería útil contar con una app para registrar mis visitas de campo y hacer seguimiento al estado productivo de cada unidad que atiendo.',
      'Me gustaría contar con una plataforma donde pueda ver el estado actualizado de todas las fincas que atiendo (alertas sanitarias, parámetros de cultivo, pendientes de visita) desde mi celular o computador.',
      'Me sería útil poder enviar recomendaciones técnicas personalizadas a cada productor que atiendo directamente desde una plataforma, sin necesidad de visitarlo físicamente.',
      'Preferiría compartir contenido técnico con mis productores en formato de fichas breves o videos cortos de 2 a 3 minutos a través de una app, en lugar de documentos extensos.',
      'Si una plataforma registrara automáticamente mis visitas (fecha, finca, observaciones), la usaría para mis reportes institucionales y me ahorraría tiempo significativo cada semana.',
    ],
  },
  {
    name: 'S11: Adopción Tecnológica — Perfil de Inversión del Propietario',
    questions: [
      'Me gustaría poder revisar el estado de mi finca desde mi celular o computador sin necesidad de estar físicamente presente.',
      'Me sería útil que la plataforma digital me generara reportes de rentabilidad de mi finca de manera automática (ingresos, costos, utilidad estimada por campaña).',
      'Estaría dispuesto(a) a pagar por un servicio digital de monitoreo remoto de mi finca si me ayuda a reducir pérdidas o aumentar ingresos de forma demostrable.',
      'Me interesaría que la plataforma digital estuviera integrada con mi sistema de crédito o financiamiento para facilitar la gestión de líneas agropecuarias.',
      'Esperaría ver resultados concretos en menos de seis meses para considerar que la inversión en una plataforma de gestión de finca valió la pena.',
    ],
  },
  {
    name: 'S11: Adopción Tecnológica — Productores y Propietarios Residentes',
    questions: [
      'La función que usaría primero en una app de gestión de finca sería el registro de mi producción o el acceso al precio de mercado de mi cultivo.',
      'Me gustaría que la app se pudiera entender sola con imágenes e íconos, sin necesidad de leer instrucciones largas.',
      'Me gustaría que la app me hablara (instrucciones en audio) en lugar de solo mostrar texto, para usarla más fácilmente mientras trabajo en el campo.',
      'Abandonaría una app si registrar un dato me tomara más de cuatro pasos o acciones en la pantalla.',
    ],
  },
  {
    name: 'S12: Aspectos fitosanitarios/Diagnóstico',
    questions: [
      'Me sería útil contar con una guía fotográfica digital en mi celular para identificar los síntomas de las principales plagas y enfermedades de mi cultivo, sin necesidad de llamar a un técnico de inmediato.',
      'Me gustaría recibir alertas fitosanitarias de mi zona (brotes detectados por otros productores o por el ICA) a través de una app, para tomar medidas preventivas antes de que lleguen a mi finca.',
      'Me sería útil una herramienta digital que me conectara con el laboratorio fitosanitario más cercano, me indicara qué muestra enviar y cómo prepararla, y me entregara los resultados en mi celular.',
      'Me gustaría llevar un historial digital de los problemas sanitarios que he tenido en mi finca (fecha, agente causal, tratamiento aplicado, resultado), para compartirlo con técnicos cuando lo necesite.',
      'Consultaría frecuentemente alertas o boletines fitosanitarios en una app durante la temporada de mayor riesgo de enfermedades en mi cultivo.',
    ],
  },
];

async function injectStrategicQuestions(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const questionRepo = manager.getRepository(Question);
  const optionRepo = manager.getRepository(OptionQuestion);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  const likertType = await typeRepo.findOne({ where: { name: 'likert' } });
  if (!likertType) throw new Error('[inject] TypeOfQuestion "likert" no encontrado.');

  let totalInserted = 0;

  for (const entry of INSTRUMENT_QUESTIONS) {
    // Find instrument (any active version)
    const instrument = await instrumentRepo.findOne({ where: { name: entry.name } });
    if (!instrument) {
      console.warn(`[inject] Instrumento "${entry.name}" no encontrado — omitido.`);
      continue;
    }

    // Find last section by max order
    const sections = await sectionRepo.find({
      where: { instrument: { instrumentId: instrument.instrumentId } },
      order: { order: 'DESC' },
    });
    if (!sections.length) {
      console.warn(`[inject] Sin secciones para "${entry.name}" — omitido.`);
      continue;
    }
    const lastSection = sections[0];

    // Idempotency: skip if strategic questions already exist in this section
    const existing = await questionRepo.count({
      where: {
        section: { sectionId: lastSection.sectionId },
        systemField: SYSTEM_FIELD,
      },
    });
    if (existing > 0) {
      console.log(`[inject] "${entry.name}" ya tiene preguntas estratégicas — omitido.`);
      continue;
    }

    // Get max order in this section
    const maxOrderResult = await questionRepo
      .createQueryBuilder('q')
      .select('MAX(q.order)', 'maxOrder')
      .where('"q"."section_id" = :sectionId', { sectionId: lastSection.sectionId })
      .getRawOne<{ maxOrder: number | null }>();
    let nextOrder = (maxOrderResult?.maxOrder ?? 0) + 1;

    // Insert questions
    for (const text of entry.questions) {
      const question = await questionRepo.save(
        questionRepo.create({
          text,
          type: likertType,
          isRequired: true,
          isSelectionCriteria: false,
          isKeyQuestion: true,
          systemField: SYSTEM_FIELD,
          order: nextOrder++,
          section: lastSection,
        }),
      );

      for (const opt of LIKERT_OPTIONS) {
        await optionRepo.save(
          optionRepo.create({
            question,
            text: opt.text,
            value: opt.value,
            isOther: false,
          }),
        );
      }
      totalInserted++;
    }

    console.log(`[inject] "${entry.name}" — ${entry.questions.length} preguntas insertadas en sección "${lastSection.name}".`);
  }

  console.log(`[inject] Total insertadas: ${totalInserted} preguntas estratégicas.`);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const dataSource = new DataSource({
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          database: process.env.DB_NAME,
          username: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        }),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ALL_ENTITIES,
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('[inject] Conexión a base de datos establecida');

  try {
    await dataSource.transaction(async (manager) => {
      await injectStrategicQuestions(manager);
    });
    console.log('[inject] Completado exitosamente');
  } catch (error) {
    console.error('[inject] Error:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void run();
