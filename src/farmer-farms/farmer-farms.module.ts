import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmCrop } from 'src/farms/entities/farm-crop.entity';
import { FarmerFarm } from './entities/farmer-farm.entity';

/**
 * Spec 94 — registra las entidades del modelo N:M productor–finca
 * (`FarmerFarm`) y del cultivo de finca (`FarmCrop`) para que el
 * `autoLoadEntities` de TypeORM las cargue. La lógica de escritura vive en
 * funciones (`farm-links.ts`) que reciben el `EntityManager` del llamador.
 */
@Module({
  imports: [TypeOrmModule.forFeature([FarmerFarm, FarmCrop])],
  exports: [TypeOrmModule],
})
export class FarmerFarmsModule {}
