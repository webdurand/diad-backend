import { Global, Module } from "@nestjs/common";
import { RequestCacheSubscriber } from "./request-cache.subscriber";
import { RequestCache } from "./request-cache.service";

/**
 * Global para que qualquer service possa injetar `RequestCache` sem alterar a
 * lista de imports de todos os módulos. Deve ser importado DEPOIS de
 * `TypeOrmModule.forRootAsync` no AppModule, porque o subscriber depende de
 * `DataSource`.
 */
@Global()
@Module({
  providers: [RequestCache, RequestCacheSubscriber],
  exports: [RequestCache],
})
export class RequestCacheModule {}
