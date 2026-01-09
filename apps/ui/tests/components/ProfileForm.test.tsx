import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProfileForm } from "../../src/components/ProfileForm";

describe("ProfileForm", () => {
  it("disables submit when nickname is too short", () => {
    const html = renderToString(
      <ProfileForm
        initialNickname="A"
        initialAvatarUrl={null}
        onSave={() => {}}
      />,
    );
    expect(html).toContain("Save Profile");
    expect(html).toContain("disabled");
  });
});
