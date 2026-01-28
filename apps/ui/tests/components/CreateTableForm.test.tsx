import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CreateTableForm } from '../../src/components/CreateTableForm';

describe('CreateTableForm', () => {
  it('disables submit when required fields are missing', () => {
    const html = renderToString(<CreateTableForm onCreate={() => {}} />);
    expect(html).toContain('Create Table');
    expect(html).toContain('disabled');
  });
});
