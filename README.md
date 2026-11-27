# PRACTICE ERP

A training-oriented ERP frontend with modules for branches, warehouses, products, suppliers, purchasing, inventory, CRM, quotations, sales, invoices, payments, and HR.

## Current status

- The uploaded `index.html` runs entirely in the browser.
- Records are saved in browser `localStorage`, not PostgreSQL.
- The current sign-in screen is **not secure authentication** and should not be used for sensitive data.
- The example transaction and invoice flows are training demonstrations.

## Local preview

Download the repository and open `index.html` in a modern browser. Use test data only.

## Planned cloud edition

1. Add a server-side API with PostgreSQL access.
2. Implement authenticated accounts and role-based permissions.
3. Migrate ERP data operations to server-validated transactional endpoints.
4. Add database schema, migrations, tests, and seed data.
5. Deploy and verify a preview on Vercel before promoting to production.

The Neon `DATABASE_URL` must stay in Vercel environment variables and must **never** be added to this repository or exposed to browser code.

## Deployment

The Vercel project is `sarika-erp-demo`. Do not replace its production deployment with this browser-only version as a completed database-backed ERP.

## Security notice

Do not use the current frontend for real customer records, payroll, passwords, payments, or other confidential business data.
