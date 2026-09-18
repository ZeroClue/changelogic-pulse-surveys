import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// No forFeature here (review N-6): UsersService only uses the SECURITY
// DEFINER helpers through raw SQL; the User entity metadata is registered by
// the modules that actually access it (SeedModule).
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
