# Security Policy

## Supported Versions

Security updates are applied to the latest release branch.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | Yes                |
| < 1.0.0 | No                 |

## Security Architecture

VibeLocus runs 100% client-side in the browser. It implements the following security safeguards:

1. **Client-Side Storage Obfuscation**: User credentials and API tokens are obfuscated prior to local storage persistence to mitigate automated memory and extension sweeps.
2. **XSS Protection**: Markdown rendering uses AST tokenization instead of raw HTML injection to prevent cross-site scripting vulnerabilities.
3. **Input Sanitization**: User inputs and uploaded filenames are sanitized to prevent directory traversal and injection vectors.
4. **Content Security Policy (CSP)**: Meta policies restrict external network requests strictly to authorized LLM endpoints and CDN assets.

## Reporting a Vulnerability

If you discover a security vulnerability in VibeLocus, please do not open a public issue. Instead, report it privately via GitHub Security Advisories or by contacting the maintainers directly.

Please include:
- A description of the vulnerability and its potential impact
- Detailed steps to reproduce or a proof of concept
- Suggested mitigations if available

We will acknowledge receipt within 48 hours and coordinate remediation before public disclosure.
