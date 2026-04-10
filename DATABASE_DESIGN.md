# 🏗️ Enterprise-Grade PostgreSQL Database Schema

This document outlines a highly scalable, multi-tenant, and production-ready PostgreSQL architecture. It is designed to be the foundation for any modern application, from a simple SaaS to a complex enterprise ecosystem.

---

## 1. Complete PostgreSQL Schema (SQL)

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy searching

-- ---------------------------------------------------------
-- CORE: APPLICATIONS (Multi-Tenant Support)
-- ---------------------------------------------------------
CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    api_key_hash VARCHAR(255) UNIQUE,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------
-- CORE: AUTHENTICATION & USERS
-- ---------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending', -- active, suspended, pending
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}', -- Flexible store for non-core profile data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(app_id, email) -- Email uniqueness scoped to the application
);

-- ---------------------------------------------------------
-- RBAC: ROLES & PERMISSIONS
-- ---------------------------------------------------------
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL, -- e.g., 'orders', 'users'
    action VARCHAR(20) NOT NULL,   -- e.g., 'create', 'read', 'delete'
    UNIQUE(app_id, name)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    UNIQUE(app_id, name)
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------
-- SYSTEM: AUDIT & LOGGING
-- ---------------------------------------------------------
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g., 'USER_LOGIN', 'DATA_UPDATE'
    entity_type VARCHAR(50),      -- e.g., 'ORDER'
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------
-- SYSTEM: GENERIC SETTINGS
-- ---------------------------------------------------------
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------
-- TRIGGERS: AUTOMATIC UPDATED_AT
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW(); 
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_timestamp();
CREATE TRIGGER sync_apps_updated_at BEFORE UPDATE ON apps FOR EACH ROW EXECUTE PROCEDURE update_timestamp();
```

---

## 2. Table Explanations

### `apps` (The Root)
This table enables **Multi-Tenancy**. By assigning every user, role, and permission to an `app_id`, you can run hundreds of different products (e.g., a "Storefront", a "Admin Portal", a "Consumer App") on the same database while keeping their data logically separated.

### `users` (Identity Manager)
- **Email Uniqueness:** We use a composite unique constraint `UNIQUE(app_id, email)`. This allows a user to have separate accounts for different apps with the same email if desired.
- **Metadata:** The `JSONB` column stores application-specific preferences (theme, language) without needing to add columns to the main table constantly.

### `roles` & `permissions` (RBAC)
This implements **Role-Based Access Control**. Instead of checking "Is this user an admin?", your code checks `permission_id`.
- Example: A role "Editor" has a permission `{resource: 'post', action: 'write'}`.
- This is significantly more scalable than simple boolean "is_admin" flags.

### `audit_logs` (Security & Traceability)
Critical for production. It uses `JSONB` to store "diffs" (`old_value` and `new_value`). If data is deleted or changed maliciously, you have a perfect paper trail of *who* did it, *when*, and from *what* IP.

---

## 3. Relationships Explanation

| Table Pair | Relationship | Description |
| :--- | :--- | :--- |
| `apps` → `users` | One-to-Many | An app has many users; users are tied to one app. |
| `roles` ↔ `permissions` | Many-to-Many | A role can have many permissions; a permission can be in many roles. |
| `users` ↔ `roles` | Many-to-Many | A user can have multiple roles (e.g., "Developer" and "Beta Tester"). |
| `users` → `audit_logs` | One-to-Many | Logs track user actions for accountability. |

---

## 4. Indexing Strategy

1.  **Unique Constraints as Indexes:** Primary keys and `UNIQUE` constraints (like `email` + `app_id`) are automatically indexed by Postgres.
2.  **Foreign Key Indexes:** In Postgres, foreign keys are *not* automatically indexed. We should add indexes on `app_id` and `user_id` across all tables to speed up `JOIN` operations.
3.  **JSONB GIN Indexes:**
    ```sql
    CREATE INDEX idx_users_metadata ON users USING GIN (metadata);
    CREATE INDEX idx_audit_logs_new_value ON audit_logs USING GIN (new_value);
    ```
    This allows searching inside the JSON objects with lightning speed.
4.  **Covering Indexes for Logs:** Adding an index on `audit_logs(created_at DESC)` ensures that "Recent Activity" dashboards load instantly even with millions of rows.

---

## 5. Security & Expansion Suggestions

### Security
- **Row-Level Security (RLS):** For multi-app scenarios, you should enable Postgres RLS. This ensures that a database connection for "App A" *literally cannot see* rows belonging to "App B", even if the SQL query doesn't have a `WHERE` clause.
- **Field-Level Encryption:** Store sensitive data like SSNs or private keys using `pgcrypto` functions or application-layer encryption before hitting the DB.

### Future Expansion
- **Partitioning:** When `audit_logs` reaches 100M+ rows, use **Table Partitioning** by `created_at` (e.g., one table per month) to keep query performance high.
- **Read Replicas:** The modular design ensures you can easily offload `audit_logs` queries to a read-only replica, keeping the main database fast for writes.
- **View Layer:** Create database `VIEWs` for complex reports to keep your backend code clean.
