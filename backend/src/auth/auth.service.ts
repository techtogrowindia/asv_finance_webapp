import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, Role } from '../common/types/auth-user';
import { JwtPayload } from '../common/auth/jwt.strategy';
import { LoginDto } from './dto/login.dto';

interface LoginLookupRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  role: Role;
  name: string;
  code: string;
  status: string;
  password_hash: string;
}

const PORTAL_ROLES: Record<'employee' | 'admin', Role[]> = {
  employee: ['FDO'],
  admin: ['BM', 'HO'],
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // Bootstrap lookup via SECURITY DEFINER function (runs before tenant context).
    const rows = await this.prisma.$queryRaw<LoginLookupRow[]>`
      SELECT * FROM auth_login_lookup(${dto.login})
    `;
    const emp = rows[0];

    const invalid = new UnauthorizedException('Invalid login or password');
    if (!emp || emp.status !== 'ACTIVE') throw invalid;

    const ok = await argon2.verify(emp.password_hash, dto.password).catch(() => false);
    if (!ok) throw invalid;

    if (dto.portal && !PORTAL_ROLES[dto.portal].includes(emp.role)) {
      throw new UnauthorizedException('This account cannot sign in from this portal');
    }

    const payload: JwtPayload = {
      sub: emp.id,
      tenantId: emp.tenant_id,
      branchId: emp.branch_id,
      role: emp.role,
      name: emp.name,
      code: emp.code,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL ?? '30m',
      }),
      this.jwt.signAsync(
        { sub: emp.id },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_TTL ?? '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: emp.id,
        name: emp.name,
        code: emp.code,
        role: emp.role,
        branchId: emp.branch_id,
      },
    };
  }

  /** The operative business date (never real-world `now()` — invariant #4). */
  async workingDate(user: AuthUser): Promise<Date> {
    return this.prisma.withTenant(user, async (tx) => {
      const branch = user.branchId
        ? await tx.branch.findUnique({ where: { id: user.branchId } })
        : await tx.branch.findFirst({ orderBy: { code: 'asc' } }); // HO: no single branch
      return branch?.workingDate ?? new Date();
    });
  }
}
