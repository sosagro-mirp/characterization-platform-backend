import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'api_keys' })
export class ApiKey {
  @PrimaryGeneratedColumn('uuid', {
    name: 'api_key_id',
  })
  apiKeyId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  name: string;

  @Column({
    name: 'key_prefix',
    type: 'varchar',
    length: 16,
    nullable: false,
    unique: true,
  })
  keyPrefix: string;

  @Column({
    name: 'key_hash',
    type: 'varchar',
    length: 255,
    nullable: false,
    select: false,
  })
  keyHash: string;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
  })
  scopes: string[];

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'userId',
  })
  user: User;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by_id',
    referencedColumnName: 'userId',
  })
  createdBy?: User;

  @Column({
    name: 'expires_at',
    type: 'timestamp',
    nullable: true,
  })
  expiresAt?: Date | null;

  @Column({
    name: 'revoked_at',
    type: 'timestamp',
    nullable: true,
  })
  revokedAt?: Date | null;

  @Column({
    name: 'last_used_at',
    type: 'timestamp',
    nullable: true,
  })
  lastUsedAt?: Date | null;

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
