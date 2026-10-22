import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultPermissions, parsePermissions, staffCan } from "./permissions.ts";

describe("teacher follow-up permissions", () => {
  it("hides follow-up and annual work for new teachers by default", () => {
    const permissions = defaultPermissions("teacher");

    assert.equal(permissions.teacherFollow, false);
    assert.equal(permissions.yearWork, false);
  });

  it("preserves manager overrides for an individual teacher", () => {
    const permissions = parsePermissions(
      { teacherFollow: true, yearWork: true },
      "teacher",
    );

    assert.equal(permissions.teacherFollow, true);
    assert.equal(permissions.yearWork, true);
  });

  it("allows the app administrator to disable only their own feature access", () => {
    const permissions = parsePermissions(
      { teacherFollow: false, yearWork: false, editStaff: false },
      "admin",
    );

    assert.equal(staffCan({ role: "admin", permissions }, "teacherFollow"), false);
    assert.equal(staffCan({ role: "admin", permissions }, "yearWork"), false);
    assert.equal(staffCan({ role: "admin", permissions }, "editStaff"), true);
  });

  it("keeps admin feature access enabled when no preference is saved", () => {
    const permissions = parsePermissions(null, "admin");

    assert.equal(permissions.teacherFollow, true);
    assert.equal(permissions.yearWork, true);
  });
});
