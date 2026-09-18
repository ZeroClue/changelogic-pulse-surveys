import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { type OrganizationRole } from '../entities/enums';
import { type AuthUserDto, type DemoUserDto } from './users.dto';

interface DemoUserRow {
  id: string;
  name: string;
  role: OrganizationRole;
  organization: string;
}

interface AuthUserRow {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: OrganizationRole;
  organization_name: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Demo login list for the UI dropdown. Read through the SECURITY DEFINER
   * `list_demo_users()` because RLS with no tenant context would otherwise
   * return zero rows (SPEC §2/§5).
   */
  async listDemoUsers(): Promise<DemoUserDto[]> {
    const rows = await this.dataSource.query<DemoUserRow[]>(
      'SELECT * FROM list_demo_users()',
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      organization: row.organization,
    }));
  }

  /**
   * Resolves the X-User-Id header to a seeded user (with org + role) through
   * the SECURITY DEFINER `get_user_for_auth(uuid)`: the guard must establish
   * the tenant context from the user row, so it cannot rely on RLS itself.
   */
  async findForAuth(userId: string): Promise<AuthUserDto | null> {
    const rows = await this.dataSource.query<AuthUserRow[]>(
      'SELECT * FROM get_user_for_auth($1)',
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationName: row.organization_name,
    };
  }
}
