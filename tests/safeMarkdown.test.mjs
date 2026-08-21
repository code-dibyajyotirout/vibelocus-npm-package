import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { SafeMarkdown } from '../dist/components/index.js';

describe('SafeMarkdown Component', () => {
  it('should be defined as a valid React component function', () => {
    assert.equal(typeof SafeMarkdown, 'function');
  });

  it('should return null when rendered with empty content', () => {
    const result = SafeMarkdown({ content: '' });
    assert.equal(result, null);
  });

  it('should return React elements when rendered with markdown text', () => {
    const content = '### Title\n\nThis is **bold** text and `inline code`.\n\n```js\nconsole.log(1);\n```';
    const element = SafeMarkdown({ content });
    assert.notEqual(element, null);
    assert.ok(React.isValidElement(element));
  });
});
