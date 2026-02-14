import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmConfig } from './config/typeorm.config';
import { AdminModule } from './models/admin/admin.module';
import { LibraryModule } from './models/library/library.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync(TypeOrmConfig),
    AdminModule,
    LibraryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
