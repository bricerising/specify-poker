import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProfileForm } from '../../src/components/ProfileForm';

describe('ProfileForm', () => {
  it('disables submit when avatar url is invalid', () => {
    const html = renderToString(
      <ProfileForm username="tester" initialAvatarUrl="not-a-url" onSave={() => {}} />,
    );
    expect(html).toContain('Save Profile');
    expect(html).toContain('disabled');
  });
});
