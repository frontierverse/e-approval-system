import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const schemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901150000_add_youth_user_permissions/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const adminActionsSource = readFileSync(
  new URL("../src/app/admin/actions.ts", import.meta.url),
  "utf8",
);
const adminQueriesSource = readFileSync(
  new URL("../src/lib/admin-queries.ts", import.meta.url),
  "utf8",
);
const adminComponentSource = readFileSync(
  new URL("../src/components/admin-user-management.tsx", import.meta.url),
  "utf8",
);
const seedSource = readFileSync(
  new URL("../prisma/seed.ts", import.meta.url),
  "utf8",
);
const initialAdminSource = readFileSync(
  new URL("../scripts/create-initial-admin.ts", import.meta.url),
  "utf8",
);

const youthPermissionFields = [
  "canViewYouthDetails",
  "canViewYouthContacts",
  "canDownloadYouthDocuments",
  "canManageYouth",
] as const;

describe("admin youth permissions", () => {
  test("adds deny-by-default User fields and safely backfills existing access", () => {
    for (const field of youthPermissionFields) {
      assert.match(
        schemaSource,
        new RegExp(`${field}\\s+Boolean\\s+@default\\(false\\)`),
      );
      assert.match(
        migrationSource,
        new RegExp(`ADD COLUMN "${field}" BOOLEAN NOT NULL DEFAULT false`),
      );
      assert.match(migrationSource, new RegExp(`"${field}" = true`));
    }

    assert.match(
      migrationSource,
      /WHERE "status" = 'ACTIVE' OR "role" = 'ADMIN'/,
    );
  });

  test("persists all four fields and forces administrator access", () => {
    assert.match(
      adminActionsSource,
      /role === UserRole\.ADMIN \|\| formData\.has\(name\)/,
    );

    for (const field of youthPermissionFields) {
      assert.match(
        adminActionsSource,
        new RegExp(`${field}: values\\.${field}`),
      );
      assert.match(adminQueriesSource, new RegExp(`${field}: true`));
      assert.match(
        adminComponentSource,
        new RegExp(`\\{ name: "${field}", label:`),
      );
    }

    assert.match(adminActionsSource, /청소년 상세 조회/);
    assert.match(adminActionsSource, /청소년 연락처 조회/);
    assert.match(adminActionsSource, /청소년 결정문 다운로드/);
    assert.match(adminActionsSource, /청소년 정보 관리/);
    assert.match(adminComponentSource, /정보 관리\(청소년 삭제 제외\)/);
    assert.doesNotMatch(adminComponentSource, /등록·수정·삭제/);
    assert.match(adminActionsSource, /formatPermissionValue/);
    assert.match(
      adminActionsSource,
      /action: AuditAction\.CREATE_USER[\s\S]*?youthPermissions:\s*\{[\s\S]*?canManageYouth: values\.canManageYouth/,
    );
  });

  test("keeps seeded staff access and initial administrators fully authorized", () => {
    for (const field of youthPermissionFields) {
      assert.match(seedSource, new RegExp(`${field}: true`));
      assert.match(initialAdminSource, new RegExp(`${field}: true`));
    }

    assert.match(seedSource, /\.\.\.fullYouthPermissions/);
    assert.equal(
      (initialAdminSource.match(/\.\.\.fullYouthPermissions/g) ?? []).length,
      2,
    );
  });
});
