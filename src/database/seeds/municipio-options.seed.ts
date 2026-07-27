import { EntityManager } from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { Town } from 'src/towns/entities/town.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';

// Spec 38 — Fase 2
// Puebla todos los municipios de los 6 departamentos del proyecto en la tabla towns
// y crea las opciones vinculadas a la pregunta "Municipio" (2aaf5f9e).
// También asigna metadata_id a las opciones existentes de la pregunta "Departamento" (3f9739f4).
//
// Mapeo nombre → metadata_id para Bloque B:
// Antioquia        → department.department_id de "Antioquia"
// Caquetá          → department.department_id de "Caquetá"
// Chocó            → department.department_id de "Chocó"
// La Guajira       → department.department_id de "La Guajira"
// Meta             → department.department_id de "Meta"
// Norte de Santander → department.department_id de "Norte de Santander"
// Otros            → null (sin departamento vinculado)

const QUESTION_ID_MUNICIPIO = '2aaf5f9e-924c-4048-9a29-d617cde4fb7d';
const QUESTION_ID_DEPARTAMENTO = '3f9739f4-6a3a-4fdd-a57b-531d70f2bdfc';

const MUNICIPIOS: Record<string, string[]> = {
  Antioquia: [
    'Abejorral', 'Abriaquí', 'Alejandría', 'Amagá', 'Amalfi', 'Andes',
    'Angelópolis', 'Angostura', 'Anorí', 'Anza', 'Apartadó', 'Arboletes',
    'Argelia', 'Armenia', 'Barbosa', 'Bello', 'Betania', 'Betulia',
    'Briceño', 'Buriticá', 'Cáceres', 'Caicedo', 'Caldas', 'Campamento',
    'Cañasgordas', 'Caracolí', 'Caramanta', 'Carepa', 'El Carmen de Viboral',
    'Carolina', 'Caucasia', 'Chigorodó', 'Cisneros', 'Cocorná', 'Concepción',
    'Concordia', 'Copacabana', 'Dabeiba', 'Don Matías', 'Ebéjico', 'El Bagre',
    'Entrerríos', 'Envigado', 'Fredonia', 'Frontino', 'Giraldo', 'Girardota',
    'Gómez Plata', 'Granada', 'Guadalupe', 'Guarne', 'Guatapé', 'Heliconia',
    'Hispania', 'Itagüí', 'Ituango', 'Jardín', 'Jericó', 'La Ceja',
    'La Estrella', 'La Pintada', 'La Unión', 'Liborina', 'Maceo', 'Marinilla',
    'Medellín', 'Montebello', 'Murindó', 'Mutatá', 'Nariño', 'Nechí',
    'Necoclí', 'Olaya', 'El Peñol', 'Peque', 'Pueblorrico', 'Puerto Berrío',
    'Puerto Nare', 'Puerto Triunfo', 'Remedios', 'Retiro', 'Rionegro',
    'Sabanalarga', 'Sabaneta', 'Salgar', 'San Andrés de Cuerquia', 'San Carlos',
    'San Francisco', 'San Jerónimo', 'San José de la Montaña',
    'San Juan de Urabá', 'San Luis', 'San Pedro de los Milagros',
    'San Pedro de Urabá', 'San Rafael', 'San Roque', 'San Vicente Ferrer',
    'Santa Bárbara', 'Santa Fe de Antioquia', 'Santa Rosa de Osos',
    'Santo Domingo', 'El Santuario', 'Segovia', 'Sonsón', 'Sopetrán',
    'Támesis', 'Tarazá', 'Tarso', 'Titiribí', 'Toledo', 'Turbo', 'Uramita',
    'Urrao', 'Valdivia', 'Valparaíso', 'Vegachí', 'Venecia',
    'Vigía del Fuerte', 'Yalí', 'Yarumal', 'Yolombó', 'Yondó', 'Zaragoza',
    'Ciudad Bolívar',
  ],
  'Caquetá': [
    'Albania', 'Belén de los Andaquíes', 'Cartagena del Chairá', 'Curillo',
    'El Doncello', 'El Paujil', 'Florencia', 'La Montañita', 'Milán',
    'Morelia', 'Puerto Rico', 'San José del Fragua', 'San Vicente del Caguán',
    'Solano', 'Solita', 'Valparaíso',
  ],
  'Chocó': [
    'Acandí', 'Alto Baudó', 'Atrato', 'Bagadó', 'Bahía Solano', 'Bajo Baudó',
    'Bojayá', 'El Carmen de Atrato', 'El Litoral del San Juan', 'Istmina',
    'Juradó', 'Lloró', 'Medio Atrato', 'Medio Baudó', 'Medio San Juan',
    'Nóvita', 'Nuquí', 'Quibdó', 'Río Iro', 'Río Quito', 'Riosucio',
    'San José del Palmar', 'Sipí', 'Tadó', 'Unguía', 'Unión Panamericana',
    'Cértegui', 'Condoto', 'Cantón de San Pablo', 'El Carmen del Darién',
  ],
  'La Guajira': [
    'Albania', 'Barrancas', 'Dibulla', 'Distracción', 'El Molino', 'Fonseca',
    'Hatonuevo', 'La Jagua del Pilar', 'Maicao', 'Manaure', 'Riohacha',
    'San Juan del Cesar', 'Uribia', 'Urumita', 'Villanueva',
  ],
  'Meta': [
    'Acacías', 'Barranca de Upía', 'Cabuyaro', 'Castilla la Nueva',
    'El Calvario', 'El Castillo', 'El Dorado', 'Fuente de Oro', 'Granada',
    'Guamal', 'La Macarena', 'La Uribe', 'Lejanías', 'Mapiripán', 'Mesetas',
    'Puerto Concordia', 'Puerto Gaitán', 'Puerto Lleras', 'Puerto López',
    'Puerto Rico', 'Restrepo', 'San Carlos de Guaroa', 'San Juan de Arama',
    'San Juanito', 'San Martín', 'Vistahermosa', 'Villavicencio',
    'Cubarral', 'Cumaral',
  ],
  'Norte de Santander': [
    'Ábrego', 'Arboledas', 'Bochalema', 'Bucarasica', 'Cachirá', 'Cácota',
    'Chinácota', 'Chitagá', 'Convención', 'Cúcuta', 'Cucutilla', 'Durania',
    'El Carmen', 'El Tarra', 'El Zulia', 'Gramalote', 'Hacarí', 'Herrán',
    'Labateca', 'La Esperanza', 'La Playa de Belén', 'Los Patios', 'Lourdes',
    'Mutiscua', 'Ocaña', 'Pamplona', 'Pamplonita', 'Puerto Santander',
    'Ragonvalia', 'Salazar', 'San Calixto', 'San Cayetano', 'Santiago',
    'Sardinata', 'Silos', 'Teorama', 'Tibú', 'Toledo', 'Villa Caro',
    'Villa del Rosario',
  ],
};

export async function seedMunicipioOptions(manager: EntityManager): Promise<void> {
  const deptRepo = manager.getRepository(Department);
  const townRepo = manager.getRepository(Town);
  const optionRepo = manager.getRepository(OptionQuestion);
  const questionRepo = manager.getRepository(Question);

  const municipioQuestion = await questionRepo.findOne({
    where: { questionId: QUESTION_ID_MUNICIPIO },
  });
  if (!municipioQuestion) {
    console.warn('[seed:municipio] Pregunta Municipio no encontrada — saltando seed.');
    return;
  }

  // ── Bloque A: towns + opciones de Municipio ──────────────────────────────

  for (const [deptName, townNames] of Object.entries(MUNICIPIOS)) {
    const dept = await deptRepo.findOne({ where: { name: deptName } });
    if (!dept) {
      console.warn(`[seed:municipio] Departamento "${deptName}" no encontrado en DB — saltando.`);
      continue;
    }

    for (const townName of townNames) {
      // Upsert town
      let town = await townRepo.findOne({
        where: { name: townName, department: { departmentId: dept.departmentId } },
        relations: ['department'],
      });
      if (!town) {
        town = townRepo.create({ name: townName, department: dept });
        town = await townRepo.save(town);
      }

      // Crear opción si no existe ya para esta pregunta + town
      const existing = await optionRepo.findOne({
        where: {
          question: { questionId: QUESTION_ID_MUNICIPIO },
          metadataId: town.townId,
        },
      });
      if (!existing) {
        const option = optionRepo.create({
          text: townName,
          metadataId: town.townId,
          question: municipioQuestion,
        });
        await optionRepo.save(option);
      }
    }

    console.log(`[seed:municipio] ${deptName}: towns y opciones sincronizados.`);
  }

  // ── Bloque B: metadata_id en opciones de Departamento ────────────────────

  const deptOptions = await optionRepo.find({
    where: { question: { questionId: QUESTION_ID_DEPARTAMENTO } },
  });

  for (const option of deptOptions) {
    const dept = await deptRepo.findOne({ where: { name: option.text } });
    if (!dept) {
      // "Otros" u opciones sin departamento vinculado — se dejan con metadata_id null
      continue;
    }
    if (option.metadataId !== dept.departmentId) {
      option.metadataId = dept.departmentId;
      await optionRepo.save(option);
      console.log(`[seed:municipio] Departamento "${option.text}" → metadata_id asignado.`);
    }
  }

  console.log('[seed:municipio] Seed completado.');
}
