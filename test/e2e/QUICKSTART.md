# Quick Start Guide - E2E Tests

## Prerequisites

Before running the tests, ensure you have:

1. **PostgreSQL Database Running**
   ```bash
   # Check if database is accessible
   psql $POSTGRES_URL -c "SELECT 1"
   ```

2. **Environment Variables Configured**
   ```bash
   # Copy example and fill in values
   cp .env.example .env.local

   # Required variables:
   # - POSTGRES_URL
   # - AUTH_SECRET
   # - NEXTAUTH_SECRET
   # - V0_API_KEY
   ```

3. **Database Migrations Run**
   ```bash
   pnpm db:migrate
   ```

4. **Playwright Browsers Installed**
   ```bash
   pnpm exec playwright install
   ```

5. **Next.js Dev Server Running** (in separate terminal)
   ```bash
   pnpm dev
   ```

## Validate Setup

Run the validation script to ensure everything is configured:

```bash
npx tsx test/e2e/validate-setup.ts
```

Expected output:
```
✅ Database connection: OK
✅ Database schema: OK
✅ Environment variables: OK
✅ Test user creation: OK
✅ Next.js server: OK
```

## Run Tests

### Run All E2E Tests
```bash
pnpm test:e2e
```

### Run Specific Test File
```bash
# Standard implementation
pnpm exec playwright test test/e2e/apps-authenticated-user.spec.ts

# Fixture-based implementation (recommended)
pnpm exec playwright test test/e2e/apps-authenticated-user-with-fixtures.spec.ts
```

### Run in Different Modes

```bash
# Headed mode (see browser)
pnpm exec playwright test --headed

# Debug mode (step through)
pnpm test:e2e:debug

# UI mode (interactive)
pnpm test:e2e:ui

# Single browser
pnpm exec playwright test --project=chromium
```

### Run Specific Test
```bash
pnpm exec playwright test -g "should complete full authenticated user flow"
```

## View Results

### HTML Report
```bash
pnpm exec playwright show-report
```

### Test Results Directory
```
./test-results/        # Screenshots, videos, traces
./playwright-report/   # HTML report
```

## Troubleshooting

### Tests Fail with "Database connection error"
- Ensure PostgreSQL is running
- Check POSTGRES_URL is correct
- Run migrations: `pnpm db:migrate`

### Tests Fail with "Timeout"
- Ensure dev server is running: `pnpm dev`
- Check server is accessible at http://localhost:3000
- Increase timeout if needed

### Tests Fail with "V0 API Error"
- Verify V0_API_KEY is set and valid
- Check V0_API_URL is correct (default: https://api.v0.dev)

### Tests Hang
- Stop all running tests: Ctrl+C
- Clear test results: `rm -rf test-results playwright-report .auth`
- Restart dev server

## Next Steps

1. Read the [full README](./README.md) for detailed documentation
2. Check [IMPLEMENTATION_SUMMARY](./IMPLEMENTATION_SUMMARY.md) for architecture details
3. Review test files to understand the patterns
4. Write your own tests following the fixture-based pattern

## Tips

- Use fixture-based tests for cleaner code
- Run validation script before debugging test failures
- Use UI mode for interactive debugging
- Check HTML report for detailed failure analysis
- Clean up `.auth/` directory if auth state gets corrupted
