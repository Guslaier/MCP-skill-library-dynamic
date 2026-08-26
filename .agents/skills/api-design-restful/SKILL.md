---
name: RESTful API Design
description: Best practices for designing REST APIs.
---
# RESTful API Design Principles

1. **Nouns, not Verbs**: Use nouns for endpoints (e.g., `GET /users`, NOT `GET /getUsers`).
2. **Plural Nouns**: Keep URLs consistent by using plural nouns (`/users/123`, not `/user/123`).
3. **HTTP Methods**:
   - `GET`: Retrieve resource(s)
   - `POST`: Create a new resource
   - `PUT`: Update an existing resource (full replacement)
   - `PATCH`: Partially update a resource
   - `DELETE`: Remove a resource
4. **Status Codes**:
   - `200 OK` (Success)
   - `201 Created` (Successfully created via POST)
   - `400 Bad Request` (Invalid input)
   - `401 Unauthorized` (Missing/invalid auth)
   - `403 Forbidden` (Auth valid, but lack permissions)
   - `404 Not Found` (Resource doesn't exist)
   - `500 Internal Server Error` (Server crashed)
5. **Versioning**: Always version APIs in the URL path (e.g., `/api/v1/users`).
