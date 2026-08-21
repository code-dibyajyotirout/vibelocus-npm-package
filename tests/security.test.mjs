import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  obfuscate,
  deobfuscate,
  sanitizeInput,
  sanitizeFileName,
} from '../dist/utils/index.js';

describe('Security & Obfuscation Utilities', () => {
  describe('obfuscate & deobfuscate', () => {
    it('should return empty string for empty input', () => {
      assert.equal(obfuscate(''), '');
      assert.equal(deobfuscate(''), '');
    });

    it('should correctly obfuscate and deobfuscate API keys', () => {
      const apiKey = 'sk-ant-api03-abcdef123456789';
      const obfuscated = obfuscate(apiKey);
      assert.notEqual(obfuscated, apiKey);
      assert.equal(typeof obfuscated, 'string');
      assert.ok(obfuscated.length > 0);

      const deobfuscated = deobfuscate(obfuscated);
      assert.equal(deobfuscated, apiKey);
    });

    it('should handle strings with special characters and URLs', () => {
      const specialText = 'https://generativelanguage.googleapis.com/v1beta?key=AIzaSy_123$!@#%';
      const obfuscated = obfuscate(specialText);
      const deobfuscated = deobfuscate(obfuscated);
      assert.equal(deobfuscated, specialText);
    });

    it('should handle invalid base64 gracefully during deobfuscation', () => {
      const invalid = 'not-valid-base64-@@@';
      const result = deobfuscate(invalid);
      assert.equal(typeof result, 'string');
    });
  });

  describe('sanitizeInput', () => {
    it('should return empty string for empty input', () => {
      assert.equal(sanitizeInput(''), '');
    });

    it('should strip script tags and enclosed code', () => {
      const malicious = "Hello <script>alert('xss')</script>World";
      assert.equal(sanitizeInput(malicious), 'Hello World');
    });

    it('should strip inline event handlers', () => {
      const malicious = '<div onclick="alert(1)" onload="evil()">Click me</div>';
      const sanitized = sanitizeInput(malicious);
      assert.ok(!sanitized.includes('onclick'));
      assert.ok(!sanitized.includes('onload'));
    });

    it('should strip javascript: URLs', () => {
      const malicious = '<a href="javascript:alert(1)">Link</a>';
      const sanitized = sanitizeInput(malicious);
      assert.ok(!sanitized.includes('javascript:'));
    });

    it('should preserve safe text and markdown formatting', () => {
      const safe = '### Quantum Computing\n**Superposition** and *entanglement*.';
      assert.equal(sanitizeInput(safe), safe);
    });
  });

  describe('sanitizeFileName', () => {
    it('should fallback to unnamed_document on empty input', () => {
      assert.equal(sanitizeFileName(''), 'unnamed_document');
    });

    it('should sanitize spaces and dangerous characters to underscores', () => {
      const unsafe = 'My Document / Path .. <File>?.pdf';
      const sanitized = sanitizeFileName(unsafe);
      assert.ok(!sanitized.includes(' '));
      assert.ok(!sanitized.includes('/'));
      assert.ok(!sanitized.includes('<'));
      assert.ok(!sanitized.includes('>'));
      assert.ok(sanitized.includes('.pdf'));
    });

    it('should truncate overly long filenames while preserving extension', () => {
      const longName = 'a'.repeat(120) + '.docx';
      const sanitized = sanitizeFileName(longName);
      assert.ok(sanitized.length <= 100);
      assert.ok(sanitized.endsWith('.docx'));
    });
  });
});
