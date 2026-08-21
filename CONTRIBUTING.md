# Contributing to VibeLocus

Thank you for your interest in contributing to VibeLocus. We welcome contributions from the community to help improve this client-side spatial learning and AI tutoring framework.

## Code of Conduct

All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md). Please maintain a professional, respectful, and collaborative environment.

## Development Workflow

### Prerequisites
- Node.js version 18.x or 20.x
- npm version 9.x or later
- Git

### Setup
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/vibelocus/vibelocus.git
   cd vibelocus
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### Available Scripts
- `npm run dev`: Starts the Next.js local development server.
- `npm test`: Runs unit tests via Vitest.
- `npm run test:watch`: Runs tests in watch mode.
- `npm run typecheck`: Runs TypeScript compiler type checking without emitting files.
- `npm run lint`: Runs ESLint validation.
- `npm run build:lib`: Builds the npm distribution package using tsup.
- `npm run build:app`: Builds the Next.js static web application export.
- `npm run build`: Builds both the library package and the web application.

## Submitting Pull Requests

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Implement your changes following established coding patterns.
3. Write unit tests in the `tests/` directory for any new logic or bug fixes.
4. Ensure all validation passes:
   ```bash
   npm run typecheck
   npm test
   npm run build:lib
   ```
5. Commit your changes with clear, descriptive commit messages. Do not use emojis in commit messages or code comments.
6. Push to your fork and submit a Pull Request against `main` using the provided PR template.

## License

By contributing to VibeLocus, you agree that your contributions will be licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
