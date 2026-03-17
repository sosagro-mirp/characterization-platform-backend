import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigitalFuncionality } from './entities/digital-funcionality.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DigitalFuncionality])],
})
export class DigitalFuncionalityModule {}
