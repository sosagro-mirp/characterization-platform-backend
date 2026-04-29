import { Institution } from 'src/institutions/entities/institution.entity';
import { Laboratory } from 'src/laboratories/entities/laboratory.entity';
import { Role } from 'src/roles/entities/role.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid', {
    name: 'user_id',
  })
  userId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  name: string;

  @Column({
    name: 'last_name',
    type: 'varchar',
    length: 50,
    nullable: false,
  })
  lastName: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  email: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
    select: false,
  })
  password: string;

  @ManyToOne(() => Institution, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'institution_id',
    referencedColumnName: 'institutionId',
  })
  institution?: Institution;

  @ManyToOne(() => Laboratory, (laboratory: Laboratory) => laboratory.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'laboratory_id',
    referencedColumnName: 'laboratoryId',
  })
  laboratory?: Laboratory;

  @ManyToOne(() => Role, (role: Role) => role.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'role_id',
    referencedColumnName: 'roleId',
  })
  role?: Role;

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
