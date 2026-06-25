import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    this.logger.log(`User ${user.email} logged in`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      // If token is revoked, revoke the whole family (token reuse detection)
      if (storedToken?.isRevoked) {
        await this.prisma.refreshToken.updateMany({
          where: { tokenFamily: storedToken.tokenFamily },
          data: { isRevoked: true, revokedAt: new Date() },
        });
      }
      throw new ForbiddenException('Invalid or expired refresh token');
    }

    const user = storedToken.user;
    if (!user.isActive) {
      throw new UnauthorizedException('User deactivated');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    // Issue new token pair (same family)
    const tokens = await this.generateTokens(user.id, user.email, user.role, storedToken.tokenFamily);

    return tokens;
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        workHoursStart: true,
        workHoursEnd: true,
        timezone: true,
        lastLoginAt: true,
        isActive: true,
        createdAt: true,
        streamMemberships: {
          include: { stream: { select: { id: true, name: true, colorHex: true } } },
        },
      },
    });
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    existingFamily?: string,
  ) {
    const tokenFamily = existingFamily ?? randomUUID();

    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRY', '15m'),
    });

    const refreshTokenValue = randomUUID();
    const tokenHash = this.hashToken(refreshTokenValue);

    const refreshExpiryDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpiryDays);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenFamily,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
