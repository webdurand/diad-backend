import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ENTITIES } from 'src/entities';


export const TypeOrmConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    return {
      type: 'postgres',
      url: configService.get<string>('DATABASE_URL'),
      ssl: { rejectUnauthorized: false },
      migrations: [],
      logging: true,
      synchronize: false,
      entities: [...ENTITIES],
    };
  },
};
