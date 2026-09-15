#!/usr/bin/env node
/**
 * WebDev schema bootstrap.
 * The production MySQL schema is provisioned through WebDev's managed database
 * migration flow. This guard keeps deploy builds idempotent and prevents the
 * legacy PostgreSQL migration files from being sent to MySQL.
 */
if (process.env.DATABASE_URL) {
  console.log(
    "[migrate] WebDev MySQL schema is provisioned — skipping legacy PostgreSQL files."
  );
} else {
  console.log(
    "[migrate] DATABASE_URL not set — local PGLite applies migrations at startup."
  );
}
