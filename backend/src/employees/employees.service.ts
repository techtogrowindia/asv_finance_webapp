import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateCentersDto } from './dto/update-centers.dto';
import { ReassignCentersDto } from './dto/reassign-centers.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Field officers the admin can assign — scoped to their branch (BM) or tenant (HO). */
  async fieldOfficers(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.EmployeeWhereInput = {
        role: 'FDO',
        status: 'ACTIVE',
        ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}),
      };
      const fdos = await tx.employee.findMany({ where, orderBy: { name: 'asc' } });
      return fdos.map((e) => ({ id: e.id, code: e.code, name: e.name }));
    });
  }

  /** Branches the admin can assign employees to — BM sees only their own. */
  async branches(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.BranchWhereInput = user.role === 'BM' && user.branchId ? { id: user.branchId } : {};
      const branches = await tx.branch.findMany({ where, orderBy: { code: 'asc' } });
      return branches.map((b) => ({ id: b.id, code: b.code, name: b.name }));
    });
  }

  /** All employees the admin can manage, with assigned-center counts (FDOs). */
  async list(user: AuthUser, opts: { role?: string; status?: string; q?: string }) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.EmployeeWhereInput = {
        ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}),
        ...(opts.role ? { role: opts.role as Prisma.EmployeeWhereInput['role'] } : {}),
        ...(opts.status ? { status: opts.status as Prisma.EmployeeWhereInput['status'] } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: 'insensitive' } },
                { login: { contains: opts.q, mode: 'insensitive' } },
                { code: { contains: opts.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const employees = await tx.employee.findMany({
        where,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        include: {
          branch: { select: { code: true, name: true } },
          accessRole: { select: { id: true, name: true } },
          _count: { select: { managing: true } },
        },
      });
      return employees.map((e) => this.serialize(e));
    });
  }

  async create(user: AuthUser, dto: CreateEmployeeDto) {
    return this.prisma.withTenant(user, async (tx) => {
      this.assertCanManageRole(user, dto.role);

      const branchId = await this.resolveBranchId(tx, user, dto.role, dto.branchId);
      const accessRoleId = await this.resolveAccessRoleId(tx, dto.accessRoleId);

      const dupLogin = await tx.employee.findUnique({ where: { login: dto.login } });
      if (dupLogin) throw new BadRequestException(`Login "${dto.login}" is already taken`);

      const passwordHash = await argon2.hash(dto.password);

      const created = await tx.employee.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          code: dto.code,
          name: dto.name,
          login: dto.login,
          passwordHash,
          role: dto.role,
          accessRoleId,
          status: 'ACTIVE',
        },
        include: {
          branch: { select: { code: true, name: true } },
          accessRole: { select: { id: true, name: true } },
          _count: { select: { managing: true } },
        },
      });
      return this.serialize(created);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateEmployeeDto) {
    if (id === user.employeeId) {
      throw new ForbiddenException('You cannot edit your own account here');
    }
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}) },
      });
      if (!existing) throw new NotFoundException('Employee not found');

      const targetRole = dto.role ?? existing.role;
      this.assertCanManageRole(user, targetRole);
      if (user.role === 'BM' && existing.role !== 'FDO') {
        throw new ForbiddenException('Branch managers can only edit field officers');
      }

      const branchId =
        'branchId' in dto || 'role' in dto
          ? await this.resolveBranchId(tx, user, targetRole, dto.branchId ?? existing.branchId ?? undefined)
          : undefined;

      if (dto.login && dto.login !== existing.login) {
        const dupLogin = await tx.employee.findUnique({ where: { login: dto.login } });
        if (dupLogin) throw new BadRequestException(`Login "${dto.login}" is already taken`);
      }

      const accessRoleId =
        'accessRoleId' in dto ? await this.resolveAccessRoleId(tx, dto.accessRoleId) : undefined;

      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...('code' in dto ? { code: dto.code } : {}),
          ...('name' in dto ? { name: dto.name } : {}),
          ...('login' in dto ? { login: dto.login } : {}),
          ...('role' in dto ? { role: dto.role } : {}),
          ...(branchId !== undefined ? { branchId } : {}),
          ...(accessRoleId !== undefined ? { accessRoleId } : {}),
          ...('status' in dto ? { status: dto.status } : {}),
        },
        include: {
          branch: { select: { code: true, name: true } },
          accessRole: { select: { id: true, name: true } },
          _count: { select: { managing: true } },
        },
      });
      return this.serialize(updated);
    });
  }

  async resetPassword(user: AuthUser, id: string, dto: ResetPasswordDto) {
    if (id === user.employeeId) {
      throw new ForbiddenException('Use your own account settings to change your password');
    }
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}) },
      });
      if (!existing) throw new NotFoundException('Employee not found');
      if (user.role === 'BM' && existing.role !== 'FDO') {
        throw new ForbiddenException('Branch managers can only reset field officer passwords');
      }

      const passwordHash = await argon2.hash(dto.password);
      await tx.employee.update({ where: { id }, data: { passwordHash } });
      return { reset: true };
    });
  }

  /** All centers in this FDO's branch, flagged whether currently assigned to them. */
  async centersFor(user: AuthUser, employeeId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const fdo = await this.findManagedFdo(tx, user, employeeId);
      const centers = await tx.center.findMany({
        where: { branchId: fdo.branchId ?? undefined },
        orderBy: { code: 'asc' },
      });
      return centers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        assigned: c.fdoId === employeeId,
      }));
    });
  }

  /** Set this FDO's managed centers to exactly the given set (add + remove in one action). */
  async updateCenters(user: AuthUser, employeeId: string, dto: UpdateCentersDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const fdo = await this.findManagedFdo(tx, user, employeeId);

      if (dto.centerIds.length > 0) {
        const targets = await tx.center.findMany({ where: { id: { in: dto.centerIds } } });
        if (targets.length !== dto.centerIds.length) throw new BadRequestException('One or more centers not found');
        const wrongBranch = targets.some((c) => c.branchId !== fdo.branchId);
        if (wrongBranch) throw new ForbiddenException('All centers must be in this field officer\'s branch');
      }

      await tx.center.updateMany({
        where: { fdoId: employeeId, id: { notIn: dto.centerIds } },
        data: { fdoId: null },
      });
      if (dto.centerIds.length > 0) {
        await tx.center.updateMany({
          where: { id: { in: dto.centerIds } },
          data: { fdoId: employeeId },
        });
      }
      return this.centersFor(user, employeeId);
    });
  }

  /** Bulk handover: move every center this FDO manages to a different FDO. */
  async reassignCenters(user: AuthUser, employeeId: string, dto: ReassignCentersDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const fromFdo = await this.findManagedFdo(tx, user, employeeId);
      if (dto.toEmployeeId === employeeId) throw new BadRequestException('Choose a different field officer');

      const toFdo = await tx.employee.findFirst({ where: { id: dto.toEmployeeId } });
      if (!toFdo) throw new BadRequestException('Target field officer not found');
      if (toFdo.role !== 'FDO') throw new BadRequestException('Target employee is not a field officer');
      if (toFdo.branchId !== fromFdo.branchId) {
        throw new ForbiddenException('Target field officer must be in the same branch');
      }

      const { count } = await tx.center.updateMany({
        where: { fdoId: employeeId },
        data: { fdoId: dto.toEmployeeId },
      });
      return { movedCount: count };
    });
  }

  /** Look up an employee this caller may manage centers for — must be an FDO, and (for BM) in their own branch. */
  private async findManagedFdo(tx: Prisma.TransactionClient, user: AuthUser, employeeId: string) {
    const fdo = await tx.employee.findFirst({
      where: { id: employeeId, ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!fdo) throw new NotFoundException('Employee not found');
    if (fdo.role !== 'FDO') throw new BadRequestException('Only field officers manage centers');
    return fdo;
  }

  /** Validate an assigned access role belongs to the tenant (RLS already scopes it). */
  private async resolveAccessRoleId(
    tx: Prisma.TransactionClient,
    requestedRoleId: string | undefined,
  ): Promise<string | null> {
    if (!requestedRoleId) return null;
    const role = await tx.accessRole.findFirst({ where: { id: requestedRoleId } });
    if (!role) throw new BadRequestException('Role not found');
    return role.id;
  }

  /** BM may only create/edit FDOs; HO may manage any role. */
  private assertCanManageRole(user: AuthUser, role: string) {
    if (user.role === 'BM' && role !== 'FDO') {
      throw new ForbiddenException('Branch managers can only manage field officers');
    }
  }

  /** BM is pinned to their own branch; HO must name a real branch in the tenant. */
  private async resolveBranchId(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    role: string,
    requestedBranchId: string | undefined,
  ): Promise<string | null> {
    if (user.role === 'BM') {
      if (!user.branchId) throw new ForbiddenException('Your account has no branch assigned');
      return user.branchId;
    }
    // HO: HO employees may float tenant-wide; FDO/BM need a real branch.
    if (!requestedBranchId) {
      if (role === 'HO') return null;
      throw new BadRequestException('A branch is required for this role');
    }
    const branch = await tx.branch.findFirst({ where: { id: requestedBranchId } });
    if (!branch) throw new BadRequestException('Branch not found');
    return branch.id;
  }

  private serialize(e: {
    id: string;
    code: string;
    name: string;
    login: string;
    role: string;
    status: string;
    branchId: string | null;
    accessRoleId: string | null;
    branch: { code: string; name: string } | null;
    accessRole: { id: string; name: string } | null;
    _count: { managing: number };
  }) {
    return {
      id: e.id,
      code: e.code,
      name: e.name,
      login: e.login,
      role: e.role,
      status: e.status,
      branchId: e.branchId,
      branchName: e.branch ? `${e.branch.code} - ${e.branch.name}` : null,
      accessRoleId: e.accessRoleId,
      roleName: e.accessRole?.name ?? null,
      centerCount: e._count.managing,
    };
  }
}
