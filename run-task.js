#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  console.log('Installing dependencies...');
  execSync('pnpm install', { stdio: 'inherit', cwd: __dirname });

  console.log('\nRunning tests...');
  execSync('pnpm test lib/deploy/github-repo.test.ts', { stdio: 'inherit', cwd: __dirname });

  console.log('\nRunning lint...');
  execSync('pnpm lint', { stdio: 'inherit', cwd: __dirname });

  console.log('\nRunning build...');
  execSync('pnpm run build', { stdio: 'inherit', cwd: __dirname });

  console.log('\n✅ All checks passed!');
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
