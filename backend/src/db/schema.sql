-- IaC Drift Detector schema (idempotent; safe to run on every startup)

CREATE TABLE IF NOT EXISTS scan (
  id                BIGSERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  resources_checked INT NOT NULL DEFAULT 0,
  drift_count       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS managed_resource (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key    TEXT NOT NULL UNIQUE,          -- e.g. aws_security_group.web
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  declared_state  JSONB,                         -- from Terraform state (null if unmanaged)
  live_state      JSONB,                         -- from cloud provider (null if missing)
  last_scanned    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drift_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         BIGINT NOT NULL REFERENCES scan(id) ON DELETE CASCADE,
  resource_key    TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  field           TEXT NOT NULL,
  change_type     TEXT NOT NULL CHECK (change_type IN ('MODIFIED','ADDED','REMOVED','MISSING','UNMANAGED')),
  declared_value  JSONB,
  live_value      JSONB,
  risk_level      TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  risk_score      INT  NOT NULL,
  classifier      TEXT NOT NULL,
  justification   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REMEDIATED')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drift_scan ON drift_record(scan_id);

CREATE TABLE IF NOT EXISTS remediation_action (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_id        UUID NOT NULL REFERENCES drift_record(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  description     TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPLIED')),
  approved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
