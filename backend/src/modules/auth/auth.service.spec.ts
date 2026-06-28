import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Role } from '@prisma/client';

// Mock the entire argon2 module at load time — jest.spyOn cannot redefine
// the non-configurable 'verify' property on native addons.
jest.mock('argon2', () => ({ verify: jest.fn() }));
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const RAW_REFRESH_TOKEN = 'raw-uuid-refresh-token';
const TOKEN_HASH = hashToken(RAW_REFRESH_TOKEN);
const TOKEN_FAMILY = 'family-uuid-001';
const ACCESS_TOKEN = 'mock.jwt.access.token';

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
}> = {}) {
  return {
    id: 'user-cuid-001',
    email: 'test@example.com',
    passwordHash: '$argon2id$placeholder',
    firstName: 'Test',
    lastName: 'User',
    role: Role.DESIGNER,
    isActive: true,
    avatarUrl: null,
    ...overrides,
  };
}

function makeStoredToken(overrides: Partial<{
  id: string;
  tokenHash: string;
  tokenFamily: string;
  isRevoked: boolean;
  expiresAt: Date;
  user: ReturnType<typeof makeUser>;
}> = {}) {
  return {
    id: 'rt-cuid-001',
    tokenHash: TOKEN_HASH,
    tokenFamily: TOKEN_FAMILY,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    user: makeUser(),
    ...overrides,
  };
}

// ─── Mock providers ───────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue(ACCESS_TOKEN),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
    const values: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_ACCESS_EXPIRY: '15m',
    };
    return values[key] ?? defaultValue;
  }),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue(ACCESS_TOKEN);
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    // Default: password verification passes — override per test where needed
    (argon2.verify as jest.Mock).mockResolvedValue(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // login()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('login()', () => {
    it('returns accessToken, refreshToken, and user shape on valid credentials', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);
      // argon2.verify returns true by default (set in beforeEach)

      const result = await service.login({ email: user.email, password: 'correct' } as LoginDto);

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: ACCESS_TOKEN,
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          }),
        }),
      );
    });

    it('stores a hashed refresh token (never the raw value)', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login({ email: user.email, password: 'correct' } as LoginDto);

      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArg = mockPrisma.refreshToken.create.mock.calls[0][0];

      // tokenHash must be the SHA-256 of the returned raw token
      expect(createArg.data.tokenHash).toBe(hashToken(result.refreshToken));
      // The raw token must NOT appear in the stored record
      expect(createArg.data.tokenHash).not.toBe(result.refreshToken);
    });

    it('updates lastLoginAt after successful login', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await service.login({ email: user.email, password: 'correct' } as LoginDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
    });

    it('throws UnauthorizedException when the email is not registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@nowhere.com', password: 'any' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the account is deactivated', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ isActive: false }));
      // argon2 should not even be called — inactive users are rejected before password check
      const verifySpy = argon2.verify as jest.Mock;

      await expect(
        service.login({ email: 'test@example.com', password: 'correct' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);

      expect(verifySpy).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('error message does not reveal whether the email exists (same message for both cases)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      let noUserErr: UnauthorizedException | undefined;
      try {
        await service.login({ email: 'ghost@nowhere.com', password: 'x' } as LoginDto);
      } catch (e) { noUserErr = e as UnauthorizedException; }

      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      let wrongPassErr: UnauthorizedException | undefined;
      try {
        await service.login({ email: 'test@example.com', password: 'wrong' } as LoginDto);
      } catch (e) { wrongPassErr = e as UnauthorizedException; }

      // Both errors must carry the same message (no username enumeration)
      const noUserMsg = (noUserErr!.getResponse() as { message: string }).message;
      const wrongPassMsg = (wrongPassErr!.getResponse() as { message: string }).message;
      expect(noUserMsg).toBe(wrongPassMsg);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // refresh()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('refresh()', () => {
    it('returns a new token pair on a valid, non-expired, non-revoked token', async () => {
      const storedToken = makeStoredToken();
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValue({});

      const result = await service.refresh(RAW_REFRESH_TOKEN);

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: ACCESS_TOKEN,
          refreshToken: expect.any(String),
        }),
      );
    });

    it('revokes the old token before issuing the new pair', async () => {
      const storedToken = makeStoredToken();
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.refresh(RAW_REFRESH_TOKEN);

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: storedToken.id },
          data: expect.objectContaining({
            isRevoked: true,
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('issues the new token in the SAME tokenFamily as the old one (rotation within family)', async () => {
      const storedToken = makeStoredToken({ tokenFamily: 'persistent-family-abc' });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.refresh(RAW_REFRESH_TOKEN);

      const createArg = mockPrisma.refreshToken.create.mock.calls[0][0];
      expect(createArg.data.tokenFamily).toBe('persistent-family-abc');
    });

    it('throws ForbiddenException when the token does not exist in the database', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('nonexistent-token')).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the token has expired', async () => {
      const expiredToken = makeStoredToken({
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(expiredToken);

      await expect(service.refresh(RAW_REFRESH_TOKEN)).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    // ── Token reuse / family revocation ──────────────────────────────────────
    //
    // Security property: if a token that was already revoked is presented again,
    // the entire token family must be revoked. This detects replay attacks where
    // an attacker obtained a previously-used refresh token.

    it('revokes the entire token family when a revoked token is reused (replay attack)', async () => {
      const revokedToken = makeStoredToken({
        isRevoked: true,
        tokenFamily: 'compromised-family',
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(revokedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh(RAW_REFRESH_TOKEN)).rejects.toThrow(ForbiddenException);

      // Must revoke the entire family — not just the single token
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenFamily: 'compromised-family' },
          data: expect.objectContaining({ isRevoked: true }),
        }),
      );
      // Must NOT issue a new token pair
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('does NOT call updateMany when the token is simply not found (no family to revoke)', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('ghost-token')).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the user account is deactivated after token issuance', async () => {
      const tokenForInactiveUser = makeStoredToken({
        user: makeUser({ isActive: false }),
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(tokenForInactiveUser);

      await expect(service.refresh(RAW_REFRESH_TOKEN)).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // logout()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('logout()', () => {
    it('revokes the matching token by its hash', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(RAW_REFRESH_TOKEN);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: TOKEN_HASH },
          data: expect.objectContaining({ isRevoked: true }),
        }),
      );
    });

    it('uses the SHA-256 hash of the token — not the raw value — in the WHERE clause', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(RAW_REFRESH_TOKEN);

      const updateArg = mockPrisma.refreshToken.updateMany.mock.calls[0][0];
      expect(updateArg.where.tokenHash).not.toBe(RAW_REFRESH_TOKEN);
      expect(updateArg.where.tokenHash).toBe(hashToken(RAW_REFRESH_TOKEN));
    });
  });
});
