-- Tabela de auditoria de uso do banco
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "rowId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "dbUser" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_tableName_changedAt_idx" ON "AuditLog"("tableName", "changedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_rowId_idx" ON "AuditLog"("rowId");
CREATE INDEX IF NOT EXISTS "AuditLog_changedAt_idx" ON "AuditLog"("changedAt");

-- Função genérica: grava AuditLog + NOTIFY no canal fastsell_audit
CREATE OR REPLACE FUNCTION public.fastsell_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_row_id TEXT;
  v_old JSONB;
  v_new JSONB;
  v_id TEXT;
  v_payload TEXT;
BEGIN
  v_id := gen_random_uuid()::text;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    BEGIN
      v_row_id := OLD.id::text;
    EXCEPTION WHEN others THEN
      v_row_id := NULL;
    END;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    BEGIN
      v_row_id := NEW.id::text;
    EXCEPTION WHEN others THEN
      v_row_id := NULL;
    END;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN
      v_row_id := NEW.id::text;
    EXCEPTION WHEN others THEN
      v_row_id := NULL;
    END;
  END IF;

  -- Evita vazar hash de senha / secrets na auditoria
  IF v_old ? 'passwordHash' THEN
    v_old := v_old || jsonb_build_object('passwordHash', '[REDACTED]');
  END IF;
  IF v_new ? 'passwordHash' THEN
    v_new := v_new || jsonb_build_object('passwordHash', '[REDACTED]');
  END IF;
  IF v_old ? 'totpSecret' THEN
    v_old := v_old || jsonb_build_object('totpSecret', '[REDACTED]');
  END IF;
  IF v_new ? 'totpSecret' THEN
    v_new := v_new || jsonb_build_object('totpSecret', '[REDACTED]');
  END IF;
  IF v_old ? 'tokenHash' THEN
    v_old := v_old || jsonb_build_object('tokenHash', '[REDACTED]');
  END IF;
  IF v_new ? 'tokenHash' THEN
    v_new := v_new || jsonb_build_object('tokenHash', '[REDACTED]');
  END IF;

  INSERT INTO "AuditLog" ("id", "tableName", "operation", "rowId", "oldData", "newData", "dbUser", "changedAt")
  VALUES (
    v_id,
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    v_old,
    v_new,
    current_user,
    NOW()
  );

  v_payload := json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'rowId', v_row_id,
    'at', NOW()
  )::text;

  PERFORM pg_notify('fastsell_audit', v_payload);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Anexa triggers (sem AuditLog para evitar loop)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User',
    'RefreshToken',
    'PasswordResetToken',
    'LoginAttempt',
    'Address'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', lower(t), t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%s
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE PROCEDURE public.fastsell_audit_trigger()',
      lower(t), t
    );
  END LOOP;
END $$;
