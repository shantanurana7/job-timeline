import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private readonly safeSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    avatarUrl: true,
    isActive: true,
    workHoursStart: true,
    workHoursEnd: true,
    timezone: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    streamMemberships: {
      include: {
        stream: { select: { id: true, name: true, colorHex: true } },
      },
    },
  };

  async findAll(filters?: { role?: Role; isActive?: boolean; streamId?: string }) {
    const where: any = {};
    if (filters?.role) where.role = filters.role;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.streamId) {
      where.streamMemberships = { some: { streamId: filters.streamId } };
    }

    return this.prisma.user.findMany({
      where,
      select: this.safeSelect,
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        workHoursStart: dto.workHoursStart ?? '09:00',
        workHoursEnd: dto.workHoursEnd ?? '17:00',
      },
      select: this.safeSelect,
    });
  }

  async update(id: string, dto: UpdateUserDto, requesterId: string, requesterRole: Role) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    // Only admin or the user themselves
    if (requesterRole !== Role.ADMIN && requesterId !== id) {
      throw new ForbiddenException('Cannot update another user');
    }

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await argon2.hash(dto.password);
      delete data.password;
    }

    // Only admin can change role or isActive
    if (requesterRole !== Role.ADMIN) {
      delete data.role;
      delete data.isActive;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: this.safeSelect,
    });
  }

  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeSelect,
    });
  }
}
