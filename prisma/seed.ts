import { PrismaClient } from "@prisma/client";
import { seed } from "../src/lib/seedData";

const db = new PrismaClient();
seed(db)
  .then(() => console.log("Seed complete"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
