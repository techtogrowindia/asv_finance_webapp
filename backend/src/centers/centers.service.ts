import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope } from '../common/scope';

@Injectable()
export class CentersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Centers visible to the caller, with client counts. */
  async list(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const centers = await tx.center.findMany({
        where: centerScope(user),
        orderBy: { code: 'asc' },
        include: {
          branch: { select: { code: true } },
          _count: { select: { clients: true } },
        },
      });
      return centers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        branchCode: c.branch.code,
        meetingDay: c.meetingDay,
        status: c.status,
        clientCount: c._count.clients,
      }));
    });
  }

  /** The (up to 5) groups of a center with member counts + free slots. */
  async groups(user: AuthUser, centerId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const groups = await tx.groupUnit.findMany({
        where: { centerId, center: centerScope(user) },
        orderBy: { groupNo: 'asc' },
        include: { _count: { select: { clients: true } } },
      });
      return groups.map((g) => ({
        id: g.id,
        groupNo: g.groupNo,
        memberCount: g._count.clients,
        slotsLeft: Math.max(0, 5 - g._count.clients),
      }));
    });
  }
}
