import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, Role } from '../types/auth-user';

export interface JwtPayload {
  sub: string; // employee id
  tenantId: string;
  branchId: string | null;
  role: Role;
  name: string;
  code: string;
  permissions?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub || !payload?.tenantId) {
      throw new UnauthorizedException();
    }
    return {
      employeeId: payload.sub,
      tenantId: payload.tenantId,
      branchId: payload.branchId,
      role: payload.role,
      name: payload.name,
      code: payload.code,
      permissions: payload.permissions ?? [],
    };
  }
}
