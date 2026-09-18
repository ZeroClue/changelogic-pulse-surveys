import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { type DemoUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Demo login list for the UI dropdown. Public by design: it is fetched
   * before any user is known (header auth is demo-only per SPEC §4).
   */
  @Get()
  @Public()
  listDemoUsers(): Promise<DemoUserDto[]> {
    return this.usersService.listDemoUsers();
  }
}
