---
name: Security Fundamentals
description: Baseline security practices to prevent common vulnerabilities (OWASP).
---
# Application Security Fundamentals

1. **Never Trust User Input**: Always validate and sanitize input from the client (API requests, forms, URL parameters).
2. **SQL Injection Prevention**: NEVER concatenate strings for SQL queries. Always use Parameterized Queries or an ORM.
3. **XSS (Cross-Site Scripting)**: Sanitize HTML inputs and ensure frontend frameworks escape variables before rendering.
4. **Password Hashing**: NEVER store plain-text passwords. Always hash them using strong algorithms (e.g., bcrypt, Argon2) with a salt.
5. **Secrets Management**: NEVER hardcode API keys, secrets, or database credentials in the codebase. Use `.env` files or a secret manager.
6. **Least Privilege**: Services and database connections should only have the minimum permissions necessary to function.
7. **Rate Limiting**: Implement rate limiting on public-facing APIs (especially Authentication endpoints) to prevent brute-force and DDoS attacks.
