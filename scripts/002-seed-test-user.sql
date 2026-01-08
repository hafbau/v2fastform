-- Seed a test user for development/testing
-- Email: test@fastform.dev
-- Password: testpassword123

-- The password hash below is for 'testpassword123' generated with bcrypt (cost factor 10)
-- This script is idempotent without requiring a unique constraint on users.email.
UPDATE users
SET password = '$2b$10$sXOrjpIG3J8joq4qZdbhD.5VgX1Llhr63SK4//zbtdEj/LOr3IGuq'
WHERE email = 'test@fastform.dev';

INSERT INTO users (email, password)
SELECT
  'test@fastform.dev',
  '$2b$10$sXOrjpIG3J8joq4qZdbhD.5VgX1Llhr63SK4//zbtdEj/LOr3IGuq'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'test@fastform.dev'
);
