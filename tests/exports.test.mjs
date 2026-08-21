import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as VibeLocus from '../dist/index.js';

describe('VibeLocus Library Exports', () => {
  it('should export core hooks', () => {
    assert.equal(typeof VibeLocus.useLLM, 'function');
    assert.equal(typeof VibeLocus.useIndexedDB, 'function');
    assert.equal(typeof VibeLocus.useSpeech, 'function');
  });

  it('should export UI components', () => {
    assert.equal(typeof VibeLocus.SafeMarkdown, 'function');
    assert.equal(typeof VibeLocus.Settings, 'function');
    assert.equal(typeof VibeLocus.TutorChat, 'function');
    assert.equal(typeof VibeLocus.SyllabusList, 'function');
    assert.equal(typeof VibeLocus.MemoryHub, 'function');
    assert.equal(typeof VibeLocus.SemanticSearch, 'function');
    assert.equal(typeof VibeLocus.ShareModal, 'function');
    assert.equal(typeof VibeLocus.Sidebar, 'function');
  });

  it('should export security and share utilities', () => {
    assert.equal(typeof VibeLocus.obfuscate, 'function');
    assert.equal(typeof VibeLocus.deobfuscate, 'function');
    assert.equal(typeof VibeLocus.sanitizeInput, 'function');
    assert.equal(typeof VibeLocus.sanitizeFileName, 'function');
    assert.equal(typeof VibeLocus.encodeShareData, 'function');
    assert.equal(typeof VibeLocus.decodeShareData, 'function');
    assert.equal(typeof VibeLocus.generateShareUrl, 'function');
  });

  it('should export default model configurations and constants', () => {
    assert.ok(VibeLocus.DEFAULT_CONFIGS);
    assert.ok(VibeLocus.DEFAULT_CONFIGS.gemini);
    assert.ok(VibeLocus.DEFAULT_CONFIGS.openai);
    assert.ok(VibeLocus.DEFAULT_CONFIGS.ollama);
    assert.ok(Array.isArray(VibeLocus.LOCAL_MODELS));
  });
});
