import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeShareData,
  decodeShareData,
  generateShareUrl,
} from '../dist/utils/index.js';

describe('Share Link Compression & Decompression', () => {
  const sampleState = {
    v: 1,
    topic: 'Quantum Computing Fundamentals',
    syllabus: [
      {
        title: 'Qubits and Superposition',
        description: 'Understanding quantum state vectors and Hilbert spaces.',
        estimated_minutes: 15,
      },
      {
        title: 'Quantum Gates and Circuits',
        description: 'Unitary transformations and Hadamard operations.',
        estimated_minutes: 20,
      },
    ],
    activeSubtopicTitle: 'Qubits and Superposition',
    chatHistory: [
      { role: 'user', content: 'What is a qubit?' },
      { role: 'assistant', content: 'A qubit is a two-state quantum mechanical system.' },
    ],
  };

  it('should compress and decompress state losslessly', () => {
    const encoded = encodeShareData(sampleState);
    assert.equal(typeof encoded, 'string');
    assert.ok(encoded.length > 0);

    const decoded = decodeShareData(encoded);
    assert.notEqual(decoded, null);
    assert.equal(decoded.topic, sampleState.topic);
    assert.equal(decoded.syllabus.length, 2);
    assert.equal(decoded.syllabus[0].title, 'Qubits and Superposition');
    assert.equal(decoded.chatHistory.length, 2);
  });

  it('should return null for malformed encoded strings', () => {
    assert.equal(decodeShareData(''), null);
    assert.equal(decodeShareData('invalid-base64-random-string'), null);
    assert.equal(decodeShareData('!!!###'), null);
  });

  it('should generate full URL containing hash fragment', () => {
    const url = generateShareUrl(sampleState);
    assert.ok(url.includes('#share='));
  });
});
