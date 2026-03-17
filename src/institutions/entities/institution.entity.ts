import { Objective } from 'src/objectives/entities/objective.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfInstitution } from 'src/types-of-institutions/entities/type-of-institution.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'institutions' })
export class Institution {
  @PrimaryGeneratedColumn('uuid', {
    name: 'institution_id',
  })
  institutionId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @ManyToOne(
    () => TypeOfInstitution,
    (typeOfInstitution: TypeOfInstitution) => typeOfInstitution.institutions,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({
    name: 'type_id',
    referencedColumnName: 'typeId',
  })
  type?: TypeOfInstitution;

  //   @Column({
  //     name: 'role_id',
  //     type: 'integer',
  //     nullable: true,
  //   })
  //   roleId?: number;

  @ManyToOne(() => Town, (town: Town) => town.institutions, {
    nullable: false,
  })
  @JoinColumn({
    name: 'town_id',
    referencedColumnName: 'townId',
  })
  town: Town;

  @ManyToMany(() => Objective)
  @JoinTable({
    name: 'institutions_objectives',
    joinColumn: {
      name: 'institution_id',
      referencedColumnName: 'institutionId',
    },
    inverseJoinColumn: {
      name: 'objective_id',
      referencedColumnName: 'objectiveId',
    },
  })
  objectives: Objective[];

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
