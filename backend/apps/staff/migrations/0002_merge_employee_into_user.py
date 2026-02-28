"""
Слияние модели Employee в User.

Порядок операций:
1. Добавить новые колонки в users (position_id, trading_point_id, hire_date, fire_date, notes)
2. Скопировать данные сотрудников в users
3. Создать User-записи для Employee без привязанного аккаунта
4. Переключить FK из payroll_schemes/shifts/salary_accruals/couriers/transactions
5. Удалить таблицу employees
"""
from django.db import migrations


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('core', '0005_add_active_trading_point'),
        ('staff', '0001_initial'),
        ('delivery', '0003_initial'),
        ('finance', '0003_initial'),
    ]

    operations = [
        # ── 1. Add employee fields to users table ──
        migrations.RunSQL(
            sql="""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS position_id uuid NULL,
                ADD COLUMN IF NOT EXISTS trading_point_id uuid NULL,
                ADD COLUMN IF NOT EXISTS hire_date date NULL,
                ADD COLUMN IF NOT EXISTS fire_date date NULL,
                ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
            """,
            reverse_sql="""
            ALTER TABLE users
                DROP COLUMN IF EXISTS position_id,
                DROP COLUMN IF EXISTS trading_point_id,
                DROP COLUMN IF EXISTS hire_date,
                DROP COLUMN IF EXISTS fire_date,
                DROP COLUMN IF EXISTS notes;
            """,
        ),

        # ── 2. Add FK constraints for new columns ──
        migrations.RunSQL(
            sql="""
            ALTER TABLE users
                ADD CONSTRAINT users_position_id_fk
                    FOREIGN KEY (position_id) REFERENCES positions(id)
                    ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED;
            ALTER TABLE users
                ADD CONSTRAINT users_trading_point_id_fk
                    FOREIGN KEY (trading_point_id) REFERENCES trading_points(id)
                    ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_position_id_fk;
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_trading_point_id_fk;
            """,
        ),

        # ── 3. Copy employee fields to linked users ──
        migrations.RunSQL(
            sql="""
            UPDATE users u SET
                position_id    = e.position_id,
                trading_point_id = e.trading_point_id,
                hire_date      = e.hire_date,
                fire_date      = e.fire_date,
                notes          = COALESCE(e.notes, ''),
                first_name     = CASE WHEN u.first_name = '' THEN e.first_name ELSE u.first_name END,
                last_name      = CASE WHEN u.last_name = '' THEN e.last_name ELSE u.last_name END,
                patronymic     = CASE WHEN u.patronymic = '' THEN COALESCE(e.patronymic, '') ELSE u.patronymic END,
                phone          = CASE WHEN u.phone = '' THEN COALESCE(e.phone, '') ELSE u.phone END,
                email          = CASE WHEN u.email = '' THEN COALESCE(e.email, '') ELSE u.email END,
                is_active      = e.is_active
            FROM employees e
            WHERE e.user_id = u.id;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 4. Create User records for employees without linked accounts ──
        # We use Employee.id as User.id so that FK values in other tables don't need changing
        migrations.RunSQL(
            sql="""
            INSERT INTO users (
                id, username, email, first_name, last_name, password,
                is_staff, is_active, is_superuser, date_joined,
                organization_id, role, patronymic, phone,
                position_id, trading_point_id, hire_date, fire_date, notes
            )
            SELECT
                e.id,
                'emp_' || REPLACE(e.id::text, '-', '') AS username,
                COALESCE(e.email, ''),
                e.first_name,
                e.last_name,
                '!unusable',
                false,
                e.is_active,
                false,
                NOW(),
                e.organization_id,
                'seller',
                COALESCE(e.patronymic, ''),
                COALESCE(e.phone, ''),
                e.position_id,
                e.trading_point_id,
                e.hire_date,
                e.fire_date,
                COALESCE(e.notes, '')
            FROM employees e
            WHERE e.user_id IS NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 5. Remap FK values for linked employees ──
        # (employee.id → employee.user_id in all referencing tables)
        # Unlinked employees used Employee.id as new User.id, so no remap needed for those.
        migrations.RunSQL(
            sql="""
            UPDATE payroll_schemes ps
               SET employee_id = e.user_id
              FROM employees e
             WHERE ps.employee_id = e.id AND e.user_id IS NOT NULL;

            UPDATE shifts s
               SET employee_id = e.user_id
              FROM employees e
             WHERE s.employee_id = e.id AND e.user_id IS NOT NULL;

            UPDATE salary_accruals sa
               SET employee_id = e.user_id
              FROM employees e
             WHERE sa.employee_id = e.id AND e.user_id IS NOT NULL;

            UPDATE couriers c
               SET employee_id = e.user_id
              FROM employees e
             WHERE c.employee_id = e.id AND e.user_id IS NOT NULL;

            UPDATE transactions t
               SET employee_id = e.user_id
              FROM employees e
             WHERE t.employee_id = e.id AND e.user_id IS NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 6. Drop old FK constraints → employees table ──
        migrations.RunSQL(
            sql="""
            -- Drop all FK constraints that reference the employees table
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN (
                    SELECT tc.constraint_name, tc.table_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.constraint_column_usage ccu
                      ON tc.constraint_name = ccu.constraint_name
                     AND tc.table_schema = ccu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND ccu.table_name = 'employees'
                      AND tc.table_schema = 'public'
                ) LOOP
                    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
                END LOOP;
            END $$;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 7. Drop the employees table ──
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS employees CASCADE;",
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── 8. Create new FK constraints → users table ──
        migrations.RunSQL(
            sql="""
            ALTER TABLE payroll_schemes
                ADD CONSTRAINT payroll_schemes_employee_id_fk
                    FOREIGN KEY (employee_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED;

            ALTER TABLE shifts
                ADD CONSTRAINT shifts_employee_id_fk
                    FOREIGN KEY (employee_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED;

            ALTER TABLE salary_accruals
                ADD CONSTRAINT salary_accruals_employee_id_fk
                    FOREIGN KEY (employee_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED;

            ALTER TABLE couriers
                ADD CONSTRAINT couriers_employee_id_fk
                    FOREIGN KEY (employee_id) REFERENCES users(id)
                    ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED;

            ALTER TABLE transactions
                ADD CONSTRAINT transactions_employee_id_fk
                    FOREIGN KEY (employee_id) REFERENCES users(id)
                    ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
            ALTER TABLE payroll_schemes DROP CONSTRAINT IF EXISTS payroll_schemes_employee_id_fk;
            ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_employee_id_fk;
            ALTER TABLE salary_accruals DROP CONSTRAINT IF EXISTS salary_accruals_employee_id_fk;
            ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_employee_id_fk;
            ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_employee_id_fk;
            """,
        ),

        # ── 9. Create indexes on new FK columns ──
        migrations.RunSQL(
            sql="""
            CREATE INDEX IF NOT EXISTS users_position_id_idx ON users(position_id);
            CREATE INDEX IF NOT EXISTS users_trading_point_id_idx ON users(trading_point_id);
            """,
            reverse_sql="""
            DROP INDEX IF EXISTS users_position_id_idx;
            DROP INDEX IF EXISTS users_trading_point_id_idx;
            """,
        ),
    ]
