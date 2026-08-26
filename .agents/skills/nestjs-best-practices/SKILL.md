---
description: "Guidelines and best practices for creating NestJS Entities, Services, and Controllers using TypeORM and PostgreSQL."
---

# NestJS & TypeORM Best Practices

When writing NestJS code for this project, you MUST strictly adhere to the following rules:

## 1. Entities
- Always use the `@Entity()` decorator.
- Use `uuid` for primary keys: `@PrimaryGeneratedColumn('uuid')`.
- All timestamps should be automatically managed: Use `@CreateDateColumn()` and `@UpdateDateColumn()`.
- Example:
  ```typescript
  import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

  @Entity()
  export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
  }
  ```

## 2. Services
- Always inject repositories using `@InjectRepository(Entity)`.
- Use DTOs for data transfer, never pass raw request objects into services.
- Handle business logic errors gracefully using built-in `HttpException` classes (e.g., `NotFoundException`).

## 3. Controllers
- Keep controllers lean. They should only handle routing, validation, and calling services.
- Always use decorators for request methods (`@Get`, `@Post`, etc.) and parameters (`@Body`, `@Param`).
- Use `ValidationPipe` globally or locally for all `@Body` DTOs.
