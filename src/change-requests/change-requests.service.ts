import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangeRequest } from './entities/change-request.entity';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ListChangeRequestsQueryDto } from './dto/list-change-requests-query.dto';
import { ResolvedSinceQueryDto } from './dto/resolved-since-query.dto';
import { User } from 'src/users/entities/user.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';

@Injectable()
export class ChangeRequestsService {
  constructor(
    @InjectRepository(ChangeRequest)
    private readonly repo: Repository<ChangeRequest>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Farmer)
    private readonly farmersRepo: Repository<Farmer>,
  ) {}

  async create(dto: CreateChangeRequestDto, userId: string): Promise<ChangeRequest> {
    const hasLocalId = !!dto.localId;
    const hasCategory = !!dto.category;

    if (!hasLocalId && !hasCategory) {
      throw new BadRequestException('Se requiere "category" para tickets web o "localId" para tickets móvil.');
    }

    // Idempotency for mobile: return existing if localId already registered for this user
    if (hasLocalId) {
      const existing = await this.repo.findOne({
        where: { localId: dto.localId, createdBy: { userId } },
        relations: { createdBy: true, farmer: true, resolvedBy: true },
      });
      if (existing) return { ticket: existing, wasCreated: false };
    }

    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    let farmer: Farmer | null = null;
    if (dto.farmerId) {
      farmer = await this.farmersRepo.findOne({ where: { id: dto.farmerId } });
      if (!farmer) throw new NotFoundException('Agricultor no encontrado.');
    }

    const request = this.repo.create({
      description: dto.description,
      source: hasLocalId ? 'mobile' : 'web',
      category: dto.category ?? null,
      localId: dto.localId ?? null,
      status: 'open',
      createdBy: user,
      farmer,
      resolvedBy: null,
      resolvedAt: null,
    });

    const ticket = await this.repo.save(request);
    return { ticket, wasCreated: true };
  }

  async findAll(query: ListChangeRequestsQueryDto): Promise<ChangeRequest[]> {
    const qb = this.repo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.createdBy', 'createdBy')
      .leftJoinAndSelect('cr.resolvedBy', 'resolvedBy')
      .leftJoinAndSelect('cr.farmer', 'farmer')
      .orderBy('cr.createdAt', 'DESC');

    if (query.status && query.status !== 'all') {
      qb.andWhere('cr.status = :status', { status: query.status });
    }
    if (query.source && query.source !== 'all') {
      qb.andWhere('cr.source = :source', { source: query.source });
    }

    return qb.getMany();
  }

  async findOne(changeRequestId: string): Promise<ChangeRequest> {
    const cr = await this.repo.findOne({
      where: { changeRequestId },
      relations: { createdBy: true, resolvedBy: true, farmer: true },
    });
    if (!cr) throw new NotFoundException('Solicitud de cambio no encontrada.');
    return cr;
  }

  async resolve(changeRequestId: string, resolverUserId: string): Promise<ChangeRequest> {
    const cr = await this.findOne(changeRequestId);

    if (cr.status === 'resolved') {
      throw new BadRequestException('La solicitud ya está resuelta.');
    }

    const resolver = await this.usersRepo.findOne({ where: { userId: resolverUserId } });
    if (!resolver) throw new NotFoundException('Usuario no encontrado.');

    cr.status = 'resolved';
    cr.resolvedBy = resolver;
    cr.resolvedAt = new Date();

    return this.repo.save(cr);
  }

  async myResolved(userId: string, query: ResolvedSinceQueryDto): Promise<ChangeRequest[]> {
    const qb = this.repo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.farmer', 'farmer')
      .leftJoinAndSelect('cr.resolvedBy', 'resolvedBy')
      .where('cr.createdBy = :userId', { userId })
      .andWhere('cr.status = :status', { status: 'resolved' })
      .orderBy('cr.resolvedAt', 'DESC');

    if (query.since) {
      qb.andWhere('cr.resolvedAt >= :since', { since: new Date(query.since) });
    }

    return qb.getMany();
  }
}
