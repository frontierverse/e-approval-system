import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { UserRole, UserStatus } from "../src/generated/prisma/client.ts";
import { getEffectiveYouthPermissions } from "../src/lib/youth-permissions-core.ts";

const fullStoredPermissions = {
  canViewYouthDetails: true,
  canViewYouthContacts: true,
  canDownloadYouthDocuments: true,
  canManageYouth: true,
};

const noStoredPermissions = {
  canViewYouthDetails: false,
  canViewYouthContacts: false,
  canDownloadYouthDocuments: false,
  canManageYouth: false,
};

describe("youth permission policy", () => {
  test("gives every active user basic roster access without elevating details", () => {
    assert.deepEqual(
      getEffectiveYouthPermissions({
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        ...noStoredPermissions,
      }),
      {
        canViewYouthBasic: true,
        canViewYouthDetails: false,
        canViewYouthContacts: false,
        canDownloadYouthDocuments: false,
        canManageYouth: false,
        canDeleteYouth: false,
      },
    );
  });

  test("honors separately assigned permissions for active users", () => {
    const permissions = getEffectiveYouthPermissions({
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      ...noStoredPermissions,
      canViewYouthDetails: true,
      canDownloadYouthDocuments: true,
    });

    assert.equal(permissions.canViewYouthDetails, true);
    assert.equal(permissions.canDownloadYouthDocuments, true);
    assert.equal(permissions.canViewYouthContacts, false);
    assert.equal(permissions.canManageYouth, false);
    assert.equal(permissions.canDeleteYouth, false);
  });

  test("always gives active administrators every youth permission", () => {
    assert.deepEqual(
      getEffectiveYouthPermissions({
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        ...noStoredPermissions,
      }),
      {
        canViewYouthBasic: true,
        ...fullStoredPermissions,
        canDeleteYouth: true,
      },
    );
  });

  test("does not grant youth access to inactive accounts", () => {
    assert.deepEqual(
      getEffectiveYouthPermissions({
        role: UserRole.ADMIN,
        status: UserStatus.INACTIVE,
        ...fullStoredPermissions,
      }),
      {
        canViewYouthBasic: false,
        canViewYouthDetails: false,
        canViewYouthContacts: false,
        canDownloadYouthDocuments: false,
        canManageYouth: false,
        canDeleteYouth: false,
      },
    );
  });
});

describe("youth permission server boundaries", () => {
  const youthActionsSource = readFileSync(
    new URL("../src/app/youth/actions.ts", import.meta.url),
    "utf8",
  );
  const decisionDocumentRouteSource = readFileSync(
    new URL(
      "../src/app/youth/decision-documents/[id]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const rosterSource = readFileSync(
    new URL("../src/lib/youth-roster.ts", import.meta.url),
    "utf8",
  );
  const learningSchedulesSource = readFileSync(
    new URL("../src/lib/youth-learning-schedules.ts", import.meta.url),
    "utf8",
  );
  const youthManagementSource = readFileSync(
    new URL("../src/lib/youth-management.ts", import.meta.url),
    "utf8",
  );
  const learningProgressPageSource = readFileSync(
    new URL("../src/app/youth/learning-progress/page.tsx", import.meta.url),
    "utf8",
  );
  const learningProgressPrintSource = readFileSync(
    new URL(
      "../src/app/youth/learning-progress/print/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  test("rechecks detail, contact, management, delete, and download permission", () => {
    assert.match(
      youthActionsSource,
      /recordYouthDetailViewAction[\s\S]*?requireYouthPermission\("canViewYouthDetails"\)/,
    );
    assert.match(
      youthActionsSource,
      /recordYouthContactViewAction[\s\S]*?requireYouthPermission\("canViewYouthContacts"\)/,
    );
    assert.match(
      youthActionsSource,
      /createYouthAction[\s\S]*?requireYouthPermission\("canManageYouth"\)/,
    );
    assert.match(
      youthActionsSource,
      /deleteYouthAction[\s\S]*?requireAdmin\(\)/,
    );
    assert.match(
      decisionDocumentRouteSource,
      /hasYouthPermission\(user, "canDownloadYouthDocuments"\)/,
    );
    assert.match(decisionDocumentRouteSource, /status: 403/);
  });

  test("keeps actual contacts out of roster and mutation payloads", () => {
    assert.match(rosterSource, /familyContacts: \[\]/);
    assert.match(rosterSource, /phone: null/);
    assert.match(
      rosterSource,
      /hasContact:\s*permissions\.canViewYouthContacts && hasRegisteredYouthContact\(record\)/,
    );
    assert.match(rosterSource, /age: canViewDetails[\s\S]*?: null/);
    assert.match(
      youthActionsSource,
      /mapYouthProfileForRosterResponse[\s\S]*?familyContacts: \[\][\s\S]*?phone: null/,
    );
  });

  test("does not hide learning progress history for a hard-coded actor", () => {
    assert.doesNotMatch(learningSchedulesSource, /신승식/);
    assert.doesNotMatch(
      learningSchedulesSource,
      /hiddenYouthLearningProgressChangeLogActorNames|shouldShowYouthLearningProgressChangeLogActor/,
    );
  });

  test("loads only the youth directory fields needed by learning progress", () => {
    assert.match(
      youthManagementSource,
      /export async function getYouthDirectory\(\)[\s\S]*?select:\s*\{\s*id: true,\s*name: true,\s*\}/,
    );
    assert.match(learningProgressPageSource, /getYouthDirectory\(\)/);
    assert.match(learningProgressPrintSource, /getYouthDirectory\(\)/);
    assert.doesNotMatch(learningProgressPageSource, /getYouthProfiles/);
    assert.doesNotMatch(learningProgressPrintSource, /getYouthProfiles/);
  });
});
