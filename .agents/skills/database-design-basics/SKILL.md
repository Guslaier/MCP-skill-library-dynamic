---
name: Database Schema Design
description: Fundamental principles for Relational Database (SQL) design.
---
# Database Design Basics

1. **Naming Conventions**: 
   - Tables: `snake_case`, plural (e.g., `users`, `order_items`)
   - Columns: `snake_case` (e.g., `created_at`, `first_name`)
2. **Primary Keys**: Every table MUST have a primary key (usually an auto-incrementing `id` or UUID).
3. **Foreign Keys**: Enforce referential integrity by using Foreign Keys for relationships.
4. **Timestamps**: Every table should have `created_at` and `updated_at` timestamps to track record history.
5. **Normalization**:
   - Avoid duplicating data.
   - Use junction tables for Many-to-Many relationships.
6. **Indexing**: 
   - Add indexes to foreign keys and columns frequently used in `WHERE` or `ORDER BY` clauses to improve read performance.
   - Avoid over-indexing, as it slows down `INSERT`/`UPDATE` operations.
