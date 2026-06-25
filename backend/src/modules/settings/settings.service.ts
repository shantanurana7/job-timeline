import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.setting.findMany({
      where: { isSecret: false },
      orderBy: { key: 'asc' },
    });
  }

  async findOne(key: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { tenantId_key: { tenantId: 'default', key } },
    });
    if (!setting) throw new NotFoundException(`Setting '${key}' not found`);
    return setting;
  }

  async update(key: string, value: string, updatedById: string) {
    await this.findOne(key);
    return this.prisma.setting.update({
      where: { tenantId_key: { tenantId: 'default', key } },
      data: { value, updatedById },
    });
  }
}
