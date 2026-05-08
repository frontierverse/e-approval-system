import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const adminDepartmentId = "dept-corporation";
const adminPositionId = "pos-director";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getRequiredEnv("DATABASE_URL"),
  }),
});

async function main() {
  const email = getRequiredEnv("INITIAL_ADMIN_EMAIL").trim().toLowerCase();
  const password = getRequiredEnv("INITIAL_ADMIN_PASSWORD");
  const name = (process.env.INITIAL_ADMIN_NAME ?? "운영 관리자").trim();

  if (!isValidEmail(email)) {
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  }

  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters.");
  }

  await ensureOrganizationDefaults();

  const user = await prisma.user.upsert({
    where: {
      email,
    },
    update: {
      name,
      passwordHash: hashPassword(password),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      departmentId: adminDepartmentId,
      positionId: adminPositionId,
    },
    create: {
      name,
      email,
      passwordHash: hashPassword(password),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      departmentId: adminDepartmentId,
      positionId: adminPositionId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  console.log(`Initial admin is ready: ${user.email} (${user.name})`);
}

async function ensureOrganizationDefaults() {
  await prisma.department.upsert({
    where: {
      id: adminDepartmentId,
    },
    update: {
      name: "법인",
      code: "CORP",
      isActive: true,
      sortOrder: 2,
    },
    create: {
      id: adminDepartmentId,
      name: "법인",
      code: "CORP",
      isActive: true,
      sortOrder: 2,
    },
  });

  await prisma.position.upsert({
    where: {
      id: adminPositionId,
    },
    update: {
      name: "이사",
      level: 5,
      sortOrder: 5,
      isActive: true,
    },
    create: {
      id: adminPositionId,
      name: "이사",
      level: 5,
      sortOrder: 5,
      isActive: true,
    },
  });
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
