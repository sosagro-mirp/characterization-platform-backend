import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

async function saveQuestion(
  manager: EntityManager,
  def: {
    text: string;
    type: TypeOfQuestion;
    isRequired: boolean;
    isSelectionCriteria?: boolean;
    isKeyQuestion?: boolean;
    order: number;
    section: Section;
    conditionQuestion?: Question;
    conditionValue?: string;
    systemField?: string;
  },
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    isKeyQuestion: def.isKeyQuestion ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
    systemField: def.systemField,
  }));
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean; metadataId?: string }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
      metadataId: opt.metadataId,
    }));
    map.set(opt.text, saved.optionId);
  }
  return map;
}

const NAME = `S1a: Identificación del encuestado/propietario/productor`;
const VERSION = 1;

export async function seedInstrumentoS1aIdentificacionDelEncuestadoPropietarioProductor(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "open_text", "single_choice", "yes_no"];
  const types: Record<string, TypeOfQuestion> = {};
  for (const n of typeNames) {
    const t = await typeRepo.findOne({ where: { name: n } });
    if (!t) throw new Error(`[seed] TypeOfQuestion "${n}" no encontrado.`);
    types[n] = t;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2026-06-25',
      isActive: false,
      code: 'S1',
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `Identificación del encuestado/propietario/productor`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Ubicación`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Acceso desde el Casco Urbano`, order: 3, instrument }))
  ]);

  // ── Identificación del encuestado/propietario/productor ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Nombre completo del encuestado`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.name',
    });

    await saveQuestion(manager, {
      text: `Número de cédula / documento de identidad`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.documentId',
    });

    await saveQuestion(manager, {
      text: `Correo electrónico del encuestado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      systemField: 'farmer.email',
    });

    await saveQuestion(manager, {
      text: `Número de celular del encuestado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      systemField: 'farmer.phone',
    });

    const q_f81b9104_9402_4cb4_af65_29f502d19d4a = await saveQuestion(manager, {
      text: `¿El encuestado es el propietario de la unidad productiva?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.isRespondent',
    });

    await saveQuestion(manager, {
      text: `Nombre completo del propietario`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_f81b9104_9402_4cb4_af65_29f502d19d4a,
      conditionValue: 'false',
      systemField: 'farmer.producerName',
    });

    await saveQuestion(manager, {
      text: `Número de celular del propietario`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f81b9104_9402_4cb4_af65_29f502d19d4a,
      conditionValue: 'false',
      systemField: 'farmer.producerPhone',
    });

    await saveQuestion(manager, {
      text: `Correo electrónico del propietario`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f81b9104_9402_4cb4_af65_29f502d19d4a,
      conditionValue: 'false',
      systemField: 'farmer.producerEmail',
    });

    const q_a4acda48_6ce9_414d_8940_7d6f30c981ee = await saveQuestion(manager, {
      text: `¿El encuestado es el productor o encargado principal de la unidad productiva?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.isRespondent',
    });

    const q_6aadcfbb_dd25_4fbb_a8e3_75cf03aba5b8 = await saveQuestion(manager, {
      text: `Perfil del productor`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_6aadcfbb_dd25_4fbb_a8e3_75cf03aba5b8, [
      { text: `Encargado de cultivo` },
      { text: `Transformador / Agroindustrializador` },
      { text: `Comercializador` },
      { text: `Extensionista / Técnico` },
      { text: `Otros`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `Nombre completo del productor`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_a4acda48_6ce9_414d_8940_7d6f30c981ee,
      conditionValue: 'false',
      systemField: 'farmer.producerName',
    });

    await saveQuestion(manager, {
      text: `Número de documento del productor o número de documento del encuestado`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_a4acda48_6ce9_414d_8940_7d6f30c981ee,
      conditionValue: 'false',
      systemField: 'farmer.producerDocumentId',
    });

    await saveQuestion(manager, {
      text: `Número de celular del productor`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a4acda48_6ce9_414d_8940_7d6f30c981ee,
      conditionValue: 'false',
      systemField: 'farmer.producerPhone',
    });

    await saveQuestion(manager, {
      text: `Correo electrónico del productor`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a4acda48_6ce9_414d_8940_7d6f30c981ee,
      conditionValue: 'false',
      systemField: 'farmer.producerEmail',
    });

    const q_fffe0682_4d12_4bbc_b4ea_56f53ca65412 = await saveQuestion(manager, {
      text: `Género del productor(a)`,
      type: types.single_choice,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.gender',
    });
    await saveOptions(manager, q_fffe0682_4d12_4bbc_b4ea_56f53ca65412, [
      { text: `Hombre` },
      { text: `Mujer` },
      { text: `Prefiere no responder` },
    ]);

    await saveQuestion(manager, {
      text: `Edad del productor(a)`,
      type: types.numeric,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.age',
    });

    const q_1ecaf425_1aa3_47fb_95eb_3f7fb5f4a9de = await saveQuestion(manager, {
      text: `¿Pertenece el productor a alguno de los siguientes grupos o territorios? (Puede marcar más de una opción)`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_1ecaf425_1aa3_47fb_95eb_3f7fb5f4a9de, [
      { text: `Comunidades negras, afrocolombianas, raizales y palenqueras (NARP)` },
      { text: `Comunidad LGBTIQ+` },
      { text: `Municipio en zona PDET` },
      { text: `Municipio en zona ZOMAC` },
      { text: `Ninguna de las anteriores` },
    ]);

    await saveQuestion(manager, {
      text: `Años de experiencia en la actividad productiva`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.experienceYears',
    });

    await saveQuestion(manager, {
      text: `¿La actividad agrícola es la principal fuente de ingresos del hogar?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.isMainIncome',
    });

  }

  // ── Ubicación ──
  {
    let o = 1;

    const q_e8cd045f_1901_40b6_b8fb_9ec49dd5f1b3 = await saveQuestion(manager, {
      text: `Departamento`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
      systemField: 'farm.department',
    });
    await saveOptions(manager, q_e8cd045f_1901_40b6_b8fb_9ec49dd5f1b3, [
      { text: `Chocó`, metadataId: 'db92c446-622e-46e6-adaa-245a1f34984d' },
      { text: `Caquetá`, metadataId: '2f670bf1-1038-46fc-93f5-6829ca666d01' },
      { text: `Antioquia`, metadataId: '37fcdf20-1406-42b0-b4a6-39a959c9b4ce' },
      { text: `Norte de Santander`, metadataId: 'ba99ad24-9961-446c-ad77-10128e882505' },
      { text: `La Guajira`, metadataId: 'c917507e-a955-4236-b3d9-181ea61f2c51' },
      { text: `Meta`, metadataId: '1f522d05-da7a-4124-b689-119b5465e8a2' },
      { text: `Otros`, isOther: true },
    ]);

    const q_25f2a0ae_7e48_489e_a46c_37e28cf1a662 = await saveQuestion(manager, {
      text: `Municipio`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
      systemField: 'farm.town',
    });
    await saveOptions(manager, q_25f2a0ae_7e48_489e_a46c_37e28cf1a662, [
      { text: `Villavicencio`, metadataId: '69656a84-3460-4974-b7d3-ec17fcdb9a8c' },
      { text: `Amagá`, metadataId: '47949991-6a42-4dd5-954d-c81ddb5f7820' },
      { text: `Amalfi`, metadataId: '4ca969e0-3dca-483d-9c3d-8b7769071cc4' },
      { text: `Andes`, metadataId: 'd5f488aa-d35f-4587-8ef5-740eb5802741' },
      { text: `Angelópolis`, metadataId: '3b5b83ca-9b1c-4c5b-bdea-08b3f38244fc' },
      { text: `Angostura`, metadataId: '04f218be-e603-4dab-a6ff-90e825ad37fd' },
      { text: `Anorí`, metadataId: '2e1f6652-fef1-4ee5-87c6-963e8ff9765d' },
      { text: `Anza`, metadataId: 'c74c3122-8288-4388-990d-e949290156c0' },
      { text: `Apartadó`, metadataId: '16340c3a-c707-4bac-b7aa-e24ecdf87707' },
      { text: `Arboletes`, metadataId: '9df65328-6d63-42ca-8f5e-142b32b8c582' },
      { text: `Argelia`, metadataId: '5304cf76-ab90-4c1b-bac9-6e8494483fb8' },
      { text: `Armenia`, metadataId: 'd38453e9-cbdf-4358-9f9d-de44aa1ce876' },
      { text: `Barbosa`, metadataId: 'b00160ba-2b1c-485f-81c8-b20d95810215' },
      { text: `Bello`, metadataId: 'c82520cc-25cd-4527-bd36-6f7f115bf6eb' },
      { text: `Betania`, metadataId: '8b16c75c-8709-4664-9c82-99940a1258e7' },
      { text: `Betulia`, metadataId: '7b4c66e1-e60e-4aec-86d1-98495d50c6b9' },
      { text: `Briceño`, metadataId: '25d19199-10ce-4890-9727-48c9c7dd4c86' },
      { text: `Buriticá`, metadataId: 'aa902e33-5f33-43b0-bbbe-4baa7d61e861' },
      { text: `Cáceres`, metadataId: '13448a62-18b1-4393-96dc-6f1b70d9bfdd' },
      { text: `Caicedo`, metadataId: 'ec309d63-c0e6-4cba-a73e-ddedba780856' },
      { text: `Caldas`, metadataId: '30f48f67-0dd9-4dfe-ace6-1d7042e91919' },
      { text: `Campamento`, metadataId: 'b03904ce-ca12-439f-8e19-305621237e77' },
      { text: `Cañasgordas`, metadataId: 'aae5db71-16ec-405f-8abe-b4cf716d8cb7' },
      { text: `Caracolí`, metadataId: 'b43e66d1-00c0-4d46-a149-03cbfc129af1' },
      { text: `Caramanta`, metadataId: '4960c02e-afb5-428b-95dd-c2356b3e463c' },
      { text: `Carepa`, metadataId: '5b48af90-60d4-4b94-b264-19f28e908bab' },
      { text: `El Carmen de Viboral`, metadataId: '070682cd-61f4-4178-8360-07327cf6c038' },
      { text: `Carolina`, metadataId: '2b582fdf-ae7f-4d3b-9614-b7618dc9dbb3' },
      { text: `Caucasia`, metadataId: 'd08752d9-fe06-43bf-a2ed-b837573d7d4e' },
      { text: `Chigorodó`, metadataId: 'b5329449-6646-40e5-b0c6-7f6553f696a5' },
      { text: `Cisneros`, metadataId: 'c680b80e-2279-41f1-9c67-31ce37405898' },
      { text: `Cocorná`, metadataId: '7d477271-2b97-4de8-8762-b15d7982e8b7' },
      { text: `Concepción`, metadataId: '3feebfb8-6b0d-41c9-a492-cade26f2efe8' },
      { text: `Concordia`, metadataId: '80af5cab-b0e0-4e21-a7a6-54dd6c689492' },
      { text: `Copacabana`, metadataId: '7a45bd00-382b-420e-a16e-579dbf580a90' },
      { text: `Dabeiba`, metadataId: '064709e9-6170-4dff-8d73-5090620cfc97' },
      { text: `Don Matías`, metadataId: '4a4d9280-9be9-4010-b7b9-af92b8c02920' },
      { text: `Ebéjico`, metadataId: '44b38be8-e41b-4029-883c-7c0791b7b045' },
      { text: `El Bagre`, metadataId: '453a7dfd-be49-44ea-ae95-31f8c62bd8dd' },
      { text: `Entrerríos`, metadataId: 'e0fa2ef9-3e24-4fbb-aaae-edfbba14693d' },
      { text: `Envigado`, metadataId: '903d1c72-d392-4955-a0d7-17326f06e71c' },
      { text: `Fredonia`, metadataId: '2dc4e4e7-7d6d-420d-bd4e-16594912f426' },
      { text: `Frontino`, metadataId: 'fefd4a40-9610-4cb0-b600-ce7929292cf8' },
      { text: `Giraldo`, metadataId: '544a4d74-8f06-4196-9d65-19236eae05ee' },
      { text: `Girardota`, metadataId: 'a44ddc9e-2911-4e49-aafc-935b6165b169' },
      { text: `Gómez Plata`, metadataId: '24a7c04e-c998-4b4e-8aff-a90260886ea8' },
      { text: `Granada`, metadataId: '38b773a9-bc30-4b27-8098-8a5d724bf157' },
      { text: `Guadalupe`, metadataId: '19a18e06-dd2d-4e94-b63f-0584a9525a7d' },
      { text: `Guarne`, metadataId: '52efaaf1-2dd8-4737-ad70-d206ef1ad298' },
      { text: `Guatapé`, metadataId: 'e0c6f148-f039-4e45-8545-e7d5c517fce7' },
      { text: `Heliconia`, metadataId: '607c1ec4-0980-41ec-9c4e-a6f0db552303' },
      { text: `Hispania`, metadataId: 'c34d718e-9100-4222-bff6-851455234a43' },
      { text: `Itagüí`, metadataId: 'd5ac14dd-dd24-4312-a11e-f1a7c5800934' },
      { text: `Ituango`, metadataId: 'd9c07eda-0868-4101-8359-3e2acd65676f' },
      { text: `Jardín`, metadataId: '049c37e6-5670-4637-8097-c5191d699521' },
      { text: `Jericó`, metadataId: '0b588cf0-5ef0-4902-8806-b5a9cc4152d4' },
      { text: `La Ceja`, metadataId: '71382857-f7ba-492d-b9fa-cc96a4542c9a' },
      { text: `La Estrella`, metadataId: '858fa57f-7d1b-43ca-9478-8c150790f689' },
      { text: `La Pintada`, metadataId: '56f02639-ac1e-4a09-b5b1-82bf7dfc2a21' },
      { text: `La Unión`, metadataId: 'cded47a3-1dae-4800-afa6-e7c0f386fd0d' },
      { text: `Liborina`, metadataId: '6ff4811c-cb58-45b3-b419-442e795711b1' },
      { text: `Maceo`, metadataId: '50e69f47-d160-403f-bdbe-0ae9095aefd7' },
      { text: `Marinilla`, metadataId: 'c309ccc3-c235-4cab-99f1-f67b519e3559' },
      { text: `Medellín`, metadataId: '9debde3f-51aa-4d28-bfbb-7ea49c2db491' },
      { text: `Montebello`, metadataId: 'e7911f04-2427-4e4d-a518-5a68c04cc145' },
      { text: `Murindó`, metadataId: '25883a75-b0ac-446f-b175-bc41a0bb160f' },
      { text: `Mutatá`, metadataId: '5de5e805-1a7f-4b7c-8b2f-120c4b63512e' },
      { text: `Nariño`, metadataId: 'b012e390-8e3d-4db9-a672-9b0da27f1a5a' },
      { text: `Nechí`, metadataId: '262bf11f-a6e9-4ebc-b695-96192bb25d84' },
      { text: `Necoclí`, metadataId: 'be55eb0b-5f97-4d05-8f92-706632790fff' },
      { text: `Olaya`, metadataId: '9fd382b9-e1f2-4a77-93c2-2c5324738931' },
      { text: `El Peñol`, metadataId: 'a41a6dec-a3d5-4e1e-a5a9-f708a976b1bb' },
      { text: `Peque`, metadataId: '423114cc-9e26-47ab-81c4-7c822f3e2553' },
      { text: `Pueblorrico`, metadataId: 'edfe656d-e9fe-442c-aa7c-0002a62d10a7' },
      { text: `Puerto Berrío`, metadataId: 'c48e687c-c033-429f-b9fe-be6df84c1117' },
      { text: `Puerto Nare`, metadataId: '04d4416f-44bd-42c5-bd98-b1597ecfcf79' },
      { text: `Puerto Triunfo`, metadataId: '7ee1691f-da6a-4bb5-891c-74bec2919fbc' },
      { text: `Remedios`, metadataId: '4e53d907-d541-4788-9e0c-cbab68f7732d' },
      { text: `Retiro`, metadataId: '5ece90cf-5a19-4dda-b216-3abe0c276be1' },
      { text: `Rionegro`, metadataId: '779d3b8c-2872-4064-8833-47f81d6b4e27' },
      { text: `Sabanalarga`, metadataId: 'd45a724b-0ffe-4dae-8410-20ef21869379' },
      { text: `Sabaneta`, metadataId: '549a23c1-db72-4c97-903a-d1de6d112faa' },
      { text: `Salgar`, metadataId: 'dce05dfb-a19c-4f10-be67-73f9a1fe7e9a' },
      { text: `San Andrés de Cuerquia`, metadataId: '67d17e2d-10a9-41f1-adb8-6f691bd45ce1' },
      { text: `San Carlos`, metadataId: 'd2d8357b-3a3a-4384-8080-eedc50013a96' },
      { text: `San Francisco`, metadataId: '89eb5b6d-7a4e-4593-ad9f-da715693fcf3' },
      { text: `San Jerónimo`, metadataId: '97cc92c6-02e1-4a3c-9954-8d6c03429106' },
      { text: `San José de la Montaña`, metadataId: '475274e4-c529-4ae4-bc94-f2ac3bbf8173' },
      { text: `San Juan de Urabá`, metadataId: '290fb787-8a0d-4d2b-b75b-66c30733e3b4' },
      { text: `San Luis`, metadataId: '92eef083-b131-459f-b14d-015c4d8db13f' },
      { text: `San Pedro de los Milagros`, metadataId: '468c6176-2ba6-4998-8994-ffa420504cdd' },
      { text: `San Pedro de Urabá`, metadataId: '4933fa8e-91ec-4ca7-a416-b2476c9f3b0d' },
      { text: `San Rafael`, metadataId: '890c4da4-bdbc-48ac-834e-39d57d8a6a86' },
      { text: `San Roque`, metadataId: 'b1271170-f0df-4311-8b4a-3ed9612cdfe5' },
      { text: `San Vicente Ferrer`, metadataId: '23bbd85e-2921-4a6b-98c0-28256e4033af' },
      { text: `Santa Bárbara`, metadataId: '9f878926-2b71-4002-b5e8-d170996829e5' },
      { text: `Santa Fe de Antioquia`, metadataId: 'a6f94bc1-49cc-4e2f-bb6a-2920c923b33c' },
      { text: `Santa Rosa de Osos`, metadataId: '551e6533-7da2-40bd-b15d-b694c37d4a29' },
      { text: `Santo Domingo`, metadataId: '20bba500-7a91-4126-a31e-61055cdeb90e' },
      { text: `El Santuario`, metadataId: '1e953be3-0bde-47b5-8d8b-9b3608368012' },
      { text: `Segovia`, metadataId: '4e3cbcba-b10c-4019-b954-bf1220a80508' },
      { text: `Sonsón`, metadataId: 'fdafad40-fbce-43ce-a6b4-432cf9c8edc1' },
      { text: `Sopetrán`, metadataId: '52bc0501-c349-485f-a99a-92f4b562b1fa' },
      { text: `Támesis`, metadataId: 'c37aebd4-6230-45c4-b2ae-5db9c0ec913b' },
      { text: `Tarazá`, metadataId: '256c4310-7f45-4370-a69a-9d441f74fa08' },
      { text: `Tarso`, metadataId: 'a4535e83-448a-46a9-adda-66f2f473ed3d' },
      { text: `Titiribí`, metadataId: '5cdae003-39e3-4127-b0f0-914f212c1aea' },
      { text: `Toledo`, metadataId: 'f4b6e2e5-05d3-498d-8956-a9827409d1f7' },
      { text: `Turbo`, metadataId: 'a3bc7c8d-6c62-44a1-998e-7dee856a9cf9' },
      { text: `Uramita`, metadataId: 'cd526de7-39f1-4fc5-a70a-c900eaf7a32d' },
      { text: `Urrao`, metadataId: '38d5269f-ccc3-457e-b706-2ef774f4cd44' },
      { text: `Valdivia`, metadataId: '2f28520b-3c37-4b72-bb95-3c33be537404' },
      { text: `Valparaíso`, metadataId: '9b103bf3-155e-4244-bbb8-e57f285ce56b' },
      { text: `Vegachí`, metadataId: '3d474f4a-b4fd-45e4-930d-7ae6a4c48a24' },
      { text: `Venecia`, metadataId: '9e1cdee9-9ced-44ed-bf16-4bcf9eab6371' },
      { text: `Vigía del Fuerte`, metadataId: 'c1f88ba1-2728-4bd2-b31b-6b909343d9e2' },
      { text: `Yalí`, metadataId: '6d820be2-c723-4858-8356-3e62d09f711e' },
      { text: `Yarumal`, metadataId: '03900920-b7a4-44d0-8ffa-9d8cdfc14696' },
      { text: `Yolombó`, metadataId: '3f2f3190-c6ae-4a21-b665-71a86adacca7' },
      { text: `Yondó`, metadataId: '09e9e320-388c-462e-b792-58c0544eeeb6' },
      { text: `Zaragoza`, metadataId: '10b921c1-921f-4b92-9cfe-6ec3699f557a' },
      { text: `Ciudad Bolívar`, metadataId: 'bd737307-f5a2-40d2-a49b-ed1ac53d61c1' },
      { text: `Albania`, metadataId: 'c2a51be9-a6f7-4bbf-9750-a81b7a3949d0' },
      { text: `Belén de los Andaquíes`, metadataId: '476377fe-198b-4e0f-af89-17884656059d' },
      { text: `Cartagena del Chairá`, metadataId: '0c5d4895-e1fa-446a-ad46-47c93d3d6c6e' },
      { text: `Curillo`, metadataId: '9d49b286-8664-48ce-a1a5-cfa5cc6e9446' },
      { text: `El Doncello`, metadataId: 'bb75f61e-5440-4c3f-b4f0-9b7f3765da3c' },
      { text: `El Paujil`, metadataId: 'b7eb5d30-8779-4ee2-832f-d9aa6497c56d' },
      { text: `Florencia`, metadataId: '5d7c3188-1ab8-49c6-839a-c968116ffa69' },
      { text: `La Montañita`, metadataId: '33390ca8-ef45-457c-b68b-7d7a209f7570' },
      { text: `Milán`, metadataId: '3b282b23-e42f-4739-8e0c-4752461fe335' },
      { text: `Morelia`, metadataId: '15639fcc-47a6-4a16-824a-935ff6fb8850' },
      { text: `Puerto Rico`, metadataId: 'f94cd570-46e8-4d28-8704-72d2b0de33e8' },
      { text: `San José del Fragua`, metadataId: 'c9bb7ac9-828b-4467-a79f-b09b39d21fa4' },
      { text: `San Vicente del Caguán`, metadataId: 'ef6516bd-1352-4c0c-a028-b7cb5c02aa21' },
      { text: `Solano`, metadataId: 'b0a0b99f-af98-489e-a8d6-fab768b7e385' },
      { text: `Solita`, metadataId: 'd71475fa-3ac2-4396-82aa-3073d8271584' },
      { text: `Valparaíso`, metadataId: '805abfa5-9904-4437-b17a-cd5629e81cb3' },
      { text: `Acandí`, metadataId: '52143933-7002-45f6-9b91-eeb500a4f95f' },
      { text: `Alto Baudó`, metadataId: '9f8a0ef0-b41b-4b4b-801b-ff58fc1ccf2b' },
      { text: `Atrato`, metadataId: '64973e40-6ced-4b9b-ab18-b8df687c33af' },
      { text: `Bagadó`, metadataId: '44b5ce58-f6db-4739-8a43-40ac837ace57' },
      { text: `Bahía Solano`, metadataId: 'eef760da-89ef-46c6-a45e-499528de2f08' },
      { text: `Bajo Baudó`, metadataId: 'adebf2bb-364d-408b-9675-5373572637be' },
      { text: `Bojayá`, metadataId: '324960e3-4b18-4a3e-8c14-461da953045f' },
      { text: `El Carmen de Atrato`, metadataId: 'c9890767-c078-4133-98d7-5cb5515fd2da' },
      { text: `El Litoral del San Juan`, metadataId: '8b27494b-1411-4267-bb25-33cf546b41ff' },
      { text: `Istmina`, metadataId: '7978c026-9665-4cac-ba34-200c85a84f23' },
      { text: `Juradó`, metadataId: '7f4fea1a-1d37-4b75-99b9-cca6854cab3f' },
      { text: `Lloró`, metadataId: 'd1ba9e6a-4189-405a-93d2-36f00dad67e2' },
      { text: `Medio Atrato`, metadataId: '96c46200-5f97-4f0d-9d8a-b01f56ab3617' },
      { text: `Medio Baudó`, metadataId: 'd9ceb535-ff0e-4c20-873f-50fe581e443c' },
      { text: `Medio San Juan`, metadataId: 'e6cc6c97-7e0a-4dd2-9147-773bc4d29c92' },
      { text: `Nóvita`, metadataId: 'ee09f273-9109-4cf1-ae6a-9e88b0e934e6' },
      { text: `Nuquí`, metadataId: 'b7c5021e-326a-4cf4-846f-8c48ec151a77' },
      { text: `Quibdó`, metadataId: '2ad3de21-bbad-45b2-ac2a-5d3bd2db2ac6' },
      { text: `Río Iro`, metadataId: '0e225ace-7dfa-4a7a-bec9-7922f4718fc5' },
      { text: `Río Quito`, metadataId: '72f835b4-21ea-4698-a40f-b4cfe8b3df11' },
      { text: `Riosucio`, metadataId: 'cbbe0e58-46cb-445e-98a0-a02795b33e57' },
      { text: `San José del Palmar`, metadataId: '8785236a-fe36-4821-9ee1-906129f523fb' },
      { text: `Sipí`, metadataId: '8712e683-6927-4bfe-a862-7bf395f0c4db' },
      { text: `Tadó`, metadataId: '9e2017eb-06b1-41a1-9e8a-e32602ca0230' },
      { text: `Unguía`, metadataId: '8cd3367d-319f-4cbc-ae8c-0d6111f9cdfa' },
      { text: `Unión Panamericana`, metadataId: '4424edf9-4e1d-4605-91ff-ee1e820e20a3' },
      { text: `Cértegui`, metadataId: '1011f005-7b6c-45c1-8811-47bf6b18d8cb' },
      { text: `Condoto`, metadataId: '969a73f3-7cf5-417d-9721-33301cb26b2e' },
      { text: `Cantón de San Pablo`, metadataId: '00fc39b7-e8a4-4730-93cc-8813ba06cae5' },
      { text: `El Carmen del Darién`, metadataId: '7294c0c2-60aa-48b3-a121-88550760f533' },
      { text: `Albania`, metadataId: '54321a7d-e2c9-4e93-bdcf-23c81dc453f6' },
      { text: `Barrancas`, metadataId: 'd20970a4-f01d-4cec-8f44-245f8519c6aa' },
      { text: `Dibulla`, metadataId: '99ce3353-4b45-4157-8c89-12dd9d7a5177' },
      { text: `Distracción`, metadataId: 'ed629d06-c13f-44db-ac44-7b309d07dbb1' },
      { text: `El Molino`, metadataId: 'dd613aef-4158-4bf1-9fcd-845b32779d8f' },
      { text: `Fonseca`, metadataId: '32316f32-7466-43f1-b487-c5920ded6124' },
      { text: `Hatonuevo`, metadataId: 'f579acca-5058-463c-a346-cd6766ae1bef' },
      { text: `La Jagua del Pilar`, metadataId: 'e7d60f0a-e5c6-4c2b-bf2a-0331e79857f3' },
      { text: `Maicao`, metadataId: 'd4dd7633-06e2-4b5c-b71f-bd31014d791d' },
      { text: `Manaure`, metadataId: 'cceab6dd-ca03-456d-8a1f-54a83a3e14b1' },
      { text: `Riohacha`, metadataId: '31321fc9-508c-4837-bf91-d9c291877bd2' },
      { text: `San Juan del Cesar`, metadataId: '9b207dde-8c51-49eb-891b-9b29c7a095c4' },
      { text: `Uribia`, metadataId: '7d4d0657-3ddb-4752-b356-b7908218aeee' },
      { text: `Urumita`, metadataId: 'b38cfe97-23b3-4f6f-b9d1-0c787d3e4fbb' },
      { text: `Villanueva`, metadataId: 'c8aa2173-e612-4770-b8c3-ad6b791a2db2' },
      { text: `Acacías`, metadataId: '6e5500c7-cae6-4c1a-b80a-a4cd196d9da9' },
      { text: `Barranca de Upía`, metadataId: '5ca6542f-4377-435e-8cd4-7a7cd3aec609' },
      { text: `Cabuyaro`, metadataId: 'f0576e51-a34a-46a9-864c-c23e9309d60a' },
      { text: `Castilla la Nueva`, metadataId: 'fd738c81-5036-46fc-a587-6af99fd71a7d' },
      { text: `El Calvario`, metadataId: 'f236c349-2dbd-4fb6-9ce7-882e1b7632e8' },
      { text: `El Castillo`, metadataId: '021f61df-ea22-4640-ad6d-c6f146e2ea25' },
      { text: `El Dorado`, metadataId: 'a0ee496b-b0da-4dbe-a020-1089033d0382' },
      { text: `Fuente de Oro`, metadataId: '8b612d2d-67b5-43ee-9e21-62905d5956c8' },
      { text: `Granada`, metadataId: '05e35bec-7812-46ba-a9a5-8710a30e299e' },
      { text: `Guamal`, metadataId: '728c0d1f-bd95-4109-a6fc-d7015bddb782' },
      { text: `La Macarena`, metadataId: 'd95cfa99-6e25-4c72-ac10-4595ac7ef160' },
      { text: `La Uribe`, metadataId: '70edd635-55e5-43d5-a0a0-11ae1a0e5216' },
      { text: `Lejanías`, metadataId: '548aa57c-0181-4e60-96e9-0c8d04c4e88f' },
      { text: `Mapiripán`, metadataId: '8dfd145c-f9fd-4eda-984e-dbd5f4eb2428' },
      { text: `Mesetas`, metadataId: 'e815eb0c-dd88-4140-a8c2-f613187f5c01' },
      { text: `Puerto Concordia`, metadataId: 'ba108077-ad58-4073-91cf-cfc4528c9141' },
      { text: `Puerto Gaitán`, metadataId: 'ffc66c6d-fa2e-48b4-8e66-232fa5f9b580' },
      { text: `Puerto Lleras`, metadataId: '11e85632-fc04-499d-a285-fb17dde84f56' },
      { text: `Puerto López`, metadataId: '18c774df-8570-4f2c-8fbc-82cae5ec6d9e' },
      { text: `Puerto Rico`, metadataId: '070fb07b-eb28-41a3-a2e1-6aa11e2257e6' },
      { text: `Restrepo`, metadataId: '76ecfaa2-0d7a-4d98-8473-9ca694048d38' },
      { text: `San Carlos de Guaroa`, metadataId: 'cc47884d-1d36-414d-bb15-00d76abcdd2c' },
      { text: `San Juan de Arama`, metadataId: '93ec6cc1-f955-4ace-b0f7-e67d392cd713' },
      { text: `San Juanito`, metadataId: 'f8a19f00-f16e-47e0-b756-481c612ff829' },
      { text: `San Martín`, metadataId: '9ed72c85-6575-481a-a2db-b3957769bb52' },
      { text: `Vistahermosa`, metadataId: 'cf1138bd-0e3f-4f19-b0c3-406938a429eb' },
      { text: `Cubarral`, metadataId: '21482f08-e26f-43fe-86cd-edb5e6d00bb2' },
      { text: `Cumaral`, metadataId: 'be94c6e9-ee7d-467e-b1a5-ec1413f0d612' },
      { text: `Ábrego`, metadataId: '39b7b867-c236-431c-b2ba-cb55aed85dd6' },
      { text: `Arboledas`, metadataId: '27f4d70f-f242-4fed-8fab-ec7063a2659f' },
      { text: `Bochalema`, metadataId: '9afafc3f-7cd8-473e-9aad-259dcec986f9' },
      { text: `Bucarasica`, metadataId: '10e1f06f-80f9-4582-bb59-c5f194345dc2' },
      { text: `Cachirá`, metadataId: 'c525f6ac-431d-48b8-841c-21368fc04ed6' },
      { text: `Cácota`, metadataId: '3b49e3b3-f7b3-4707-b7db-6b1f52112665' },
      { text: `Chinácota`, metadataId: 'c4319d95-58a5-417e-8568-21b60e99a99e' },
      { text: `Chitagá`, metadataId: '10a84f4c-da85-4cd6-bf05-cbfa796cd505' },
      { text: `Convención`, metadataId: '34541c44-d558-4f10-90c5-5de26216d7d3' },
      { text: `Cúcuta`, metadataId: '57f39595-fb10-4666-8f04-2e82509a1186' },
      { text: `Cucutilla`, metadataId: '45509277-d430-4432-9a84-3079e8f6fccc' },
      { text: `Durania`, metadataId: '4cb188a9-fbe6-4bda-bd7f-c0683469e04b' },
      { text: `El Carmen`, metadataId: 'e096c13e-c13e-4ba4-9669-09df074fb1c3' },
      { text: `El Tarra`, metadataId: '0cbf21c2-1726-4b32-9fe5-d21598039c61' },
      { text: `El Zulia`, metadataId: '1d3d505a-52bd-4e8d-9910-1f8ea7d5c6c9' },
      { text: `Gramalote`, metadataId: '7709f4f3-076b-46f0-90bd-acde432d5666' },
      { text: `Hacarí`, metadataId: '9a1e3487-ee41-4821-83cc-cd2ef786781d' },
      { text: `Herrán`, metadataId: 'ed20e386-3c6b-4584-af44-c33ba9488854' },
      { text: `Labateca`, metadataId: 'ecad49bf-7740-49de-b5f9-a244ca3ba1a4' },
      { text: `La Esperanza`, metadataId: '2c9d4bef-8baa-400e-a492-617ae7c9b3db' },
      { text: `La Playa de Belén`, metadataId: '6484c9a2-c383-4836-9404-d743e46e61b5' },
      { text: `Los Patios`, metadataId: '4b4b930f-2065-475d-b1f3-ffe2db93f38e' },
      { text: `Lourdes`, metadataId: 'a2c46bcf-75d0-456d-8619-eae10d61f331' },
      { text: `Mutiscua`, metadataId: 'e888f835-4f2b-40a5-a7a8-58dd60f1f99f' },
      { text: `Ocaña`, metadataId: '8d79e92d-f4e9-4eec-9452-9bb9d90bce83' },
      { text: `Pamplona`, metadataId: 'db8fe4ef-6cba-404f-a8a5-499e2aba7d9d' },
      { text: `Pamplonita`, metadataId: '9da464f9-67a6-4d85-bca4-c396dcf47e49' },
      { text: `Puerto Santander`, metadataId: 'd4badc56-bbe8-4eb8-8041-1f7fa721f002' },
      { text: `Ragonvalia`, metadataId: '9eef6401-3dd5-41b8-9eb6-01509c9b0679' },
      { text: `Salazar`, metadataId: '834e0af8-8f03-44a6-bf15-c3f15070d39d' },
      { text: `San Calixto`, metadataId: '018b9fea-3a7b-4103-909f-7bfd3dad00b1' },
      { text: `San Cayetano`, metadataId: '8f5d1e10-4fb6-4ac5-84a4-4591bf4b54dd' },
      { text: `Santiago`, metadataId: '2f91641a-f737-4fc9-9897-2bcfc4539be5' },
      { text: `Sardinata`, metadataId: '49fa3cbf-6a53-43fb-9b03-090f734d87a5' },
      { text: `Silos`, metadataId: 'f76f58a8-4df9-4e35-8349-8b7df3b85561' },
      { text: `Teorama`, metadataId: '7d4b0a72-ec53-4642-80fb-963b20e60912' },
      { text: `Tibú`, metadataId: '49e65edb-f7ae-46ce-b6b1-deeff8ed61fe' },
      { text: `Toledo`, metadataId: '8efd6c51-aa0f-449a-a0ef-a81b3e675c17' },
      { text: `Villa Caro`, metadataId: 'a20d0041-1ca0-4b2c-b231-298f28fe1452' },
      { text: `Villa del Rosario`, metadataId: '9efaa20b-05dd-4923-a788-99f112ada15b' },
      { text: `Abriaquí`, metadataId: '14eb3ac6-a330-4032-a245-bc14b04a2fe5' },
      { text: `Alejandría`, metadataId: 'fb681017-c647-453a-9567-19dc86ea3718' },
      { text: `Abejorral`, metadataId: '6975a4e1-9482-4457-aeae-3d0997061288' },
    ]);

    await saveQuestion(manager, {
      text: `Corregimiento`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Vereda / Sector`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      systemField: 'farm.vereda',
    });

  }

  // ── Acceso desde el Casco Urbano ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Municipio de referencia más cercano`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Distancia desde el casco urbano hasta la finca (km)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Tiempo de desplazamiento hasta la finca desde el casco urbano (horas/minutos)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });

    const q_2e4a741a_40db_4997_a939_622be0bdab62 = await saveQuestion(manager, {
      text: `Medio de acceso principal`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
      systemField: 'farm.mainAccessType',
    });
    await saveOptions(manager, q_2e4a741a_40db_4997_a939_622be0bdab62, [
      { text: `Carretera pavimentada` },
      { text: `Carretera sin pavimentar` },
      { text: `Trocha / camino de herradura` },
      { text: `Vía fluvial` },
      { text: `Mixto` },
      { text: `Otros`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Es accesible la vía durante todo el año (incluyendo épocas de lluvia)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `¿Existen restricciones de acceso? (permiso por orden público)`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Observaciones sobre el acceso`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

  }

  console.log(`[seed] "${NAME}" insertado (30 preguntas).`);
}
