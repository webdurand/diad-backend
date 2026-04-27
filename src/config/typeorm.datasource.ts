import { config as dotenvConfig } from "dotenv";
import { DataSource } from "typeorm";

dotenvConfig();

const dataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  migrations: ["src/migrations/*{.ts,.js}"],
  logging: true,
  synchronize: false,
  entities: ["src/entities/*.entity{.ts,.js}"],
});

export default dataSource;
