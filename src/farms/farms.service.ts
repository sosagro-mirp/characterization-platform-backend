import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { addFarmCrops } from 'src/farmer-farms/farm-links';
import {
  activeFarmCropRefs,
  FarmCropRef,
  FarmFarmerView,
  toCropSummaries,
  toFarmFarmerViews,
} from 'src/farmer-farms/farm-views';
import { AddFarmCropDto } from './dto/add-farm-crop.dto';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { Farm } from './entities/farm.entity';
import { FarmCrop } from './entities/farm-crop.entity';

/** Spec 94 — finca con las formas histórica (`crops`) y aditivas. */
export type FarmDetail = Omit<
  Farm,
  'farmCrops' | 'farmerLinks' | 'farmers' | 'crops'
> & {
  /** Cultivos ACTIVOS (contrato histórico). */
  crops: { cropId: string; name: string }[];
  /** Cultivos activos con su id propio (el que referencian las encuestas). */
  farmCrops: FarmCropRef[];
  /** Productores vinculados, con rol y principal. Solo en el detalle. */
  farmers?: FarmFarmerView[];
};

const FARM_RELATIONS = ['farmCrops', 'farmCrops.crop'];
const FARM_DETAIL_RELATIONS = [
  ...FARM_RELATIONS,
  'farmerLinks',
  'farmerLinks.farmer',
];

/** Código Postgres de `foreign_key_violation`. */
const POSTGRES_FK_VIOLATION = '23503';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  async create(dto: CreateFarmDto): Promise<FarmDetail> {
    const {
      cropIds,
      deviceIds: _deviceIds,
      townId,
      hasStabilityElectricity,
      ...scalar
    } = dto;

    const farm = this.farmsRepository.create({
      ...scalar,
      hasElectricityAccess: hasStabilityElectricity,
      town: townId ? { townId } : undefined,
    });

    // DEBT: deviceIds se acepta en el DTO pero ni create() ni update() lo
    // persisten; falta inyectar el repo de Device y asociar farms_devices.
    const saved = await this.farmsRepository.manager.transaction(
      async (manager) => {
        const created = await manager.save(Farm, farm);
        if (cropIds?.length) {
          await this.addKnownCrops(manager, created.farmId, cropIds);
        }
        return created;
      },
    );
    return this.findOne(saved.farmId);
  }

  async findAll(): Promise<FarmDetail[]> {
    const farms = await this.farmsRepository.find({
      relations: FARM_RELATIONS,
    });
    return farms.map((farm) => this.toDetail(farm));
  }

  async findOne(id: string): Promise<FarmDetail> {
    const farm = await this.farmsRepository.findOne({
      where: { farmId: id },
      relations: FARM_DETAIL_RELATIONS,
    });
    if (!farm) throw new NotFoundException('Farm not found');
    return this.toDetail(farm, true);
  }

  async update(id: string, dto: UpdateFarmDto): Promise<FarmDetail> {
    const farm = await this.farmsRepository.findOne({ where: { farmId: id } });
    if (!farm) throw new NotFoundException('Farm not found');

    const { cropIds, ...scalar } = dto;
    Object.assign(farm, scalar);

    await this.farmsRepository.manager.transaction(async (manager) => {
      await manager.save(Farm, farm);
      if (cropIds !== undefined) {
        await this.syncCrops(manager, id, cropIds);
      }
    });
    return this.findOne(id);
  }

  /**
   * Spec 94 — `POST /farms/:id/crops`. Idempotente: suma el cultivo a la
   * finca, o lo reactiva si estaba archivado.
   */
  async addCrop(id: string, dto: AddFarmCropDto): Promise<FarmCropRef> {
    const farm = await this.farmsRepository.findOne({ where: { farmId: id } });
    if (!farm) throw new NotFoundException('Farm not found');
    const crop = await this.cropsRepository.findOne({
      where: { cropId: dto.cropId },
    });
    if (!crop) throw new NotFoundException('TypeOfCrop not found');

    const [row] = await addFarmCrops(this.farmsRepository.manager, id, [
      crop.cropId,
    ]);
    return { farmCropId: row.farmCropId, cropId: crop.cropId, name: crop.name };
  }

  async remove(id: string): Promise<void> {
    const farm = await this.farmsRepository.findOne({ where: { farmId: id } });
    if (!farm) throw new NotFoundException('Farm not found');
    try {
      await this.farmsRepository.remove(farm);
    } catch (error) {
      // Spec 94 — las encuestas ancladas a la finca (FK RESTRICT) impiden
      // borrarla; antes no había nada que la referenciara con RESTRICT.
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'La finca tiene encuestas ancladas y no puede eliminarse',
        );
      }
      throw error;
    }
  }

  /**
   * Spec 94 — `PATCH /farms/:id {cropIds}` conserva su contrato pero ya no
   * reemplaza: suma los que faltan, REACTIVA los archivados que vuelven y
   * ARCHIVA los que se quitan (las encuestas ancladas los conservan).
   */
  private async syncCrops(
    manager: EntityManager,
    farmId: string,
    cropIds: string[],
  ): Promise<void> {
    const wanted = cropIds.length
      ? (await manager.findBy(TypeOfCrop, { cropId: In(cropIds) })).map(
          (c) => c.cropId,
        )
      : [];

    await manager
      .createQueryBuilder()
      .update(FarmCrop)
      .set({ archivedAt: () => 'CURRENT_TIMESTAMP' })
      .where('farm_id = :farmId AND archived_at IS NULL', { farmId })
      .andWhere(wanted.length ? 'crop_id <> ALL(:wanted)' : '1 = 1', {
        wanted,
      })
      .execute();

    await addFarmCrops(manager, farmId, wanted);
  }

  /** Suma solo los cultivos que existen en el catálogo (los demás se ignoran). */
  private async addKnownCrops(
    manager: EntityManager,
    farmId: string,
    cropIds: string[],
  ): Promise<void> {
    const known = await manager.findBy(TypeOfCrop, { cropId: In(cropIds) });
    await addFarmCrops(
      manager,
      farmId,
      known.map((c) => c.cropId),
    );
  }

  private toDetail(farm: Farm, withFarmers = false): FarmDetail {
    const { farmCrops, farmerLinks, farmers: _mirror, ...rest } = farm;
    const detail: FarmDetail = {
      ...rest,
      crops: toCropSummaries(farmCrops),
      farmCrops: activeFarmCropRefs(farmCrops),
    };
    if (withFarmers) detail.farmers = toFarmFarmerViews(farmerLinks);
    return detail;
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'driverError' in error &&
      typeof (error as { driverError?: unknown }).driverError === 'object' &&
      (error as { driverError?: { code?: unknown } }).driverError !== null &&
      (error as { driverError: { code?: unknown } }).driverError.code ===
        POSTGRES_FK_VIOLATION
    );
  }
}
