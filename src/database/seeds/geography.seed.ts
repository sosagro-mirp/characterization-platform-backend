import { EntityManager } from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { Town } from 'src/towns/entities/town.entity';

/*
 * Veredas de referencia por municipio (texto libre en Survey.vereda):
 *
 * Medellín:               "El Manzanillo", "La Palma"
 * Apartadó:               "Zungo Arriba", "Nueva Esperanza"
 * Riohacha:               "El Pájaro", "Camarones"
 * Maicao:                 "Las Delicias", "El Cardón"
 * Quibdó:                 "La Yesca", "Pacurita"
 * Istmina:                "La Vuelta", "San Pablo"
 * Florencia:              "El Caraño", "Puerto Arango"
 * San Vicente del Caguán: "El Paujil", "Albania"
 * Villavicencio:          "Pipiral", "La Nohora"
 * Granada:                "El Dorado", "Aguas Claras"
 * Cúcuta:                 "El Rodeo", "La Garita"
 * Ocaña:                  "El Rasgón", "Los Curos"
 */

interface TownDef {
  name: string;
}

interface DepartmentDef {
  name: string;
  towns: TownDef[];
}

const GEOGRAPHY: DepartmentDef[] = [
  {
    name: 'Antioquia',
    towns: [{ name: 'Medellín' }, { name: 'Apartadó' }],
  },
  {
    name: 'La Guajira',
    towns: [{ name: 'Riohacha' }, { name: 'Maicao' }],
  },
  {
    name: 'Chocó',
    towns: [{ name: 'Quibdó' }, { name: 'Istmina' }],
  },
  {
    name: 'Caquetá',
    towns: [{ name: 'Florencia' }, { name: 'San Vicente del Caguán' }],
  },
  {
    name: 'Meta',
    towns: [{ name: 'Villavicencio' }, { name: 'Granada' }],
  },
  {
    name: 'Norte de Santander',
    towns: [{ name: 'Cúcuta' }, { name: 'Ocaña' }],
  },
];

export async function seedGeography(manager: EntityManager): Promise<void> {
  const deptRepo = manager.getRepository(Department);
  const townRepo = manager.getRepository(Town);

  for (const deptDef of GEOGRAPHY) {
    let department = await deptRepo.findOne({
      where: { name: deptDef.name },
    });

    if (!department) {
      department = deptRepo.create({ name: deptDef.name });
      department = await deptRepo.save(department);
      console.log(`[seed] Department creado: ${deptDef.name}`);
    } else {
      console.log(`[seed] Department "${deptDef.name}" ya existe. Se omite.`);
    }

    for (const townDef of deptDef.towns) {
      const existing = await townRepo.findOne({
        where: { name: townDef.name, department: { departmentId: department.departmentId } },
        relations: ['department'],
      });

      if (existing) {
        console.log(`[seed]   Town "${townDef.name}" ya existe. Se omite.`);
        continue;
      }

      const town = townRepo.create({ name: townDef.name, department });
      await townRepo.save(town);
      console.log(`[seed]   Town creada: ${townDef.name} (${deptDef.name})`);
    }
  }
}
