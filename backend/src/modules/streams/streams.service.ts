import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStreamDto, UpdateStreamDto, AddStreamMemberDto } from './dto/stream.dto';

@Injectable()
export class StreamsService {
  constructor(private prisma: PrismaService) {}

  private readonly streamSelect = {
    id: true,
    name: true,
    description: true,
    colorHex: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    members: {
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, role: true, avatarUrl: true,
          },
        },
      },
    },
    _count: { select: { jobs: true } },
  };

  async findAll(activeOnly = true) {
    return this.prisma.stream.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      select: this.streamSelect,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const stream = await this.prisma.stream.findUnique({
      where: { id },
      select: this.streamSelect,
    });
    if (!stream) throw new NotFoundException(`Stream ${id} not found`);
    return stream;
  }

  async create(dto: CreateStreamDto) {
    return this.prisma.stream.create({
      data: {
        name: dto.name,
        description: dto.description,
        colorHex: dto.colorHex ?? '#6366f1',
      },
      select: this.streamSelect,
    });
  }

  async update(id: string, dto: UpdateStreamDto) {
    await this.findOne(id);
    return this.prisma.stream.update({
      where: { id },
      data: dto,
      select: this.streamSelect,
    });
  }

  async addMember(streamId: string, dto: AddStreamMemberDto) {
    await this.findOne(streamId);
    const existing = await this.prisma.streamMember.findUnique({
      where: { userId_streamId: { userId: dto.userId, streamId } },
    });
    if (existing) throw new ConflictException('User is already a member of this stream');

    return this.prisma.streamMember.create({
      data: { userId: dto.userId, streamId, isPrimary: dto.isPrimary ?? true },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
        stream: { select: { id: true, name: true } },
      },
    });
  }

  async removeMember(streamId: string, userId: string) {
    await this.findOne(streamId);
    const member = await this.prisma.streamMember.findUnique({
      where: { userId_streamId: { userId, streamId } },
    });
    if (!member) throw new NotFoundException('Member not found in this stream');

    await this.prisma.streamMember.delete({
      where: { userId_streamId: { userId, streamId } },
    });
    return { message: 'Member removed' };
  }
}
