import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const INSTRUMENT_SCOPE_LEVELS = ['farmer', 'farm', 'farm_crop'] as const;
export type InstrumentScopeLevel = (typeof INSTRUMENT_SCOPE_LEVELS)[number];

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn('uuid', {
    name: 'instrument_id',
  })
  instrumentId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'integer',
    nullable: false,
  })
  version: number;

  @Column({
    name: 'publish_date',
    type: 'date',
    nullable: false,
  })
  publishDate: string;

  @Column({
    name: 'is_active',
    type: 'boolean',
    nullable: false,
  })
  isActive: boolean;

  // Spec 79 — este instrumento se puede compartir por una URL pública
  // (/encuesta/{instrumentId}) y recibir respuestas sin encuestador ni
  // agricultor identificados. `isActive` manda: un instrumento inactivo no
  // se sirve por el canal público aunque isPublic sea true.
  @Column({
    name: 'is_public',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isPublic: boolean;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    unique: true,
  })
  code?: string;

  // Spec 98 — a quién se le aplica el instrumento. Nulo = sin declarar: el
  // instrumento no sale en la cobertura de unidades productivas.
  @Column({
    name: 'scope_level',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  scopeLevel?: InstrumentScopeLevel | null;

  // Spec 98 — los instrumentos del mismo grupo cuentan como una sola columna.
  @Column({
    name: 'coverage_group',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  coverageGroup?: string | null;

  // Spec 98 — solo para `farm_crop`. Vacío = todos los cultivos.
  @ManyToMany(() => TypeOfCrop, { eager: false })
  @JoinTable({
    name: 'instruments_crops',
    joinColumn: { name: 'instrument_id', referencedColumnName: 'instrumentId' },
    inverseJoinColumn: { name: 'crop_id', referencedColumnName: 'cropId' },
  })
  crops?: TypeOfCrop[];

  cropIds?: string[];

  @AfterLoad()
  setCropIds(): void {
    if (this.crops) this.cropIds = this.crops.map((crop) => crop.cropId);
  }

  @OneToMany(() => Section, (section) => section.instrument)
  sections: Section[];

  @ManyToMany(() => Survey, (survey) => survey.instruments)
  surveys: Survey[];

  @ManyToMany(() => ActorType, { eager: false })
  @JoinTable({
    name: 'instruments_actor_types',
    joinColumn: { name: 'instrument_id', referencedColumnName: 'instrumentId' },
    inverseJoinColumn: {
      name: 'actor_type_id',
      referencedColumnName: 'actorTypeId',
    },
  })
  actorTypes: ActorType[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'created_by_id', referencedColumnName: 'userId' })
  createdBy?: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'updated_by_id', referencedColumnName: 'userId' })
  updatedBy?: User;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
