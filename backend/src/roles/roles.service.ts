import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { ALL_PERMISSIONS, PERMISSION_CATALOG } from '../common/auth/permissions';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The permission catalog rendered as tick-boxes on the Roles page. */
  catalog() {
    return PERMISSION_CATALOG;
  }

  /** All roles in the tenant, with how many employees hold each. */
  async list(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const roles = await tx.accessRole.findMany({
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        include: { _count: { select: { employees: true } } },
      });
      return roles.map((r) => this.serialize(r));
    });
  }

  /** Active roles for the employee-assignment dropdown. */
  async assignable(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const roles = await tx.accessRole.findMany({
        where: { isActive: true },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true },
      });
      return roles;
    });
  }

  async create(user: AuthUser, dto: CreateRoleDto) {
    const permissions = this.validatePermissions(dto.permissions);
    return this.prisma.withTenant(user, async (tx) => {
      const name = dto.name.trim();
      const dup = await tx.accessRole.findFirst({ where: { name } });
      if (dup) throw new BadRequestException(`A role named "${name}" already exists`);

      const created = await tx.accessRole.create({
        data: {
          tenantId: user.tenantId,
          name,
          permissions,
          isActive: dto.isActive ?? true,
          isSystem: false,
        },
        include: { _count: { select: { employees: true } } },
      });
      return this.serialize(created);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateRoleDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.accessRole.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Role not found');
      if (existing.isSystem) {
        throw new ForbiddenException('Built-in roles cannot be edited — create a new role instead');
      }

      const permissions = dto.permissions !== undefined ? this.validatePermissions(dto.permissions) : undefined;

      if (dto.name && dto.name.trim() !== existing.name) {
        const name = dto.name.trim();
        const dup = await tx.accessRole.findFirst({ where: { name, id: { not: id } } });
        if (dup) throw new BadRequestException(`A role named "${name}" already exists`);
      }

      const updated = await tx.accessRole.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(permissions !== undefined ? { permissions } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: { _count: { select: { employees: true } } },
      });
      return this.serialize(updated);
    });
  }

  async remove(user: AuthUser, id: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.accessRole.findFirst({
        where: { id },
        include: { _count: { select: { employees: true } } },
      });
      if (!existing) throw new NotFoundException('Role not found');
      if (existing.isSystem) throw new ForbiddenException('Built-in roles cannot be deleted');
      if (existing._count.employees > 0) {
        throw new BadRequestException(
          `Cannot delete: ${existing._count.employees} employee(s) still use this role. Reassign them first.`,
        );
      }
      await tx.accessRole.delete({ where: { id } });
      return { deleted: true };
    });
  }

  /** Reject any permission key not in the catalog. */
  private validatePermissions(keys: string[]): string[] {
    const unknown = keys.filter((k) => !ALL_PERMISSIONS.includes(k));
    if (unknown.length) throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    return Array.from(new Set(keys));
  }

  private serialize(r: {
    id: string;
    name: string;
    permissions: string[];
    isSystem: boolean;
    isActive: boolean;
    _count: { employees: number };
  }) {
    return {
      id: r.id,
      name: r.name,
      permissions: r.permissions,
      isSystem: r.isSystem,
      isActive: r.isActive,
      employeeCount: r._count.employees,
    };
  }
}
