PRAGMA foreign_keys = ON;

CREATE TABLE provider_activation (
  provider TEXT PRIMARY KEY CHECK (provider IN ('claude', 'codex')),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  baseline_completed_at TEXT,
  publish_approved_at TEXT,
  publish_reviewer TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_status TEXT CHECK (last_status IS NULL OR last_status IN ('success', 'partial', 'failed')),
  last_reason TEXT
);

INSERT INTO provider_activation (provider) VALUES ('claude'), ('codex');

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  upstream TEXT NOT NULL,
  external_id TEXT NOT NULL,
  material_hash TEXT NOT NULL,
  transition_id TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  assessment_key TEXT,
  upstream_revision TEXT,
  action TEXT NOT NULL CHECK (action IN ('announced_future', 'confirmed_applied', 'banked_offer', 'correction', 'withdrawal', 'needs_review')),
  event_date TEXT,
  detected_at TEXT NOT NULL,
  first_detected_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  UNIQUE (provider, upstream, external_id)
);

CREATE INDEX events_provider_date_id ON events (provider, event_date DESC, id DESC);
CREATE INDEX events_provider_action_date ON events (provider, action, event_date DESC, id DESC);

CREATE TABLE observations (
  observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id),
  observation_key TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  assessment_key TEXT,
  upstream_revision TEXT,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  UNIQUE (event_id, observation_key)
);
CREATE INDEX observations_event_time ON observations (event_id, detected_at DESC, observation_id DESC);

CREATE TRIGGER observations_immutable_update BEFORE UPDATE ON observations
BEGIN SELECT RAISE(ABORT, 'observations are immutable'); END;
CREATE TRIGGER observations_immutable_delete BEFORE DELETE ON observations
BEGIN SELECT RAISE(ABORT, 'observations are immutable'); END;

CREATE TABLE event_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  transition_id TEXT NOT NULL UNIQUE,
  material_hash TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  assessment_key TEXT,
  upstream_revision TEXT,
  action TEXT NOT NULL CHECK (action IN ('announced_future', 'confirmed_applied', 'banked_offer', 'correction', 'withdrawal', 'needs_review')),
  event_date TEXT,
  detected_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  candidate INTEGER NOT NULL CHECK (candidate IN (0, 1)),
  UNIQUE (event_id, sequence),
  UNIQUE (event_id, transition_id)
);
CREATE INDEX event_versions_event_sequence ON event_versions (event_id, sequence DESC);

CREATE TRIGGER event_versions_immutable_update BEFORE UPDATE ON event_versions
BEGIN SELECT RAISE(ABORT, 'event_versions are immutable'); END;
CREATE TRIGGER event_versions_immutable_delete BEFORE DELETE ON event_versions
BEGIN SELECT RAISE(ABORT, 'event_versions are immutable'); END;

CREATE TABLE publication_candidates (
  transition_id TEXT PRIMARY KEY REFERENCES event_versions(transition_id),
  event_id TEXT NOT NULL REFERENCES events(id),
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'suppressed'))
);
CREATE INDEX publication_candidates_provider_time ON publication_candidates (provider, created_at DESC, transition_id DESC);

CREATE TABLE source_state (
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  endpoint_key TEXT NOT NULL,
  snapshot TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
  etag TEXT,
  checked_at TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  retry_until INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  retained_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, endpoint_key)
);

CREATE TABLE sync_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  generation INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  complete_snapshot INTEGER NOT NULL CHECK (complete_snapshot IN (0, 1)),
  event_count INTEGER NOT NULL CHECK (event_count >= 0),
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  reason TEXT
);
CREATE INDEX sync_runs_provider_time ON sync_runs (provider, started_at DESC, run_id DESC);

CREATE TABLE synthetic_deliveries (
  event_id TEXT NOT NULL REFERENCES events(id),
  transition_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (substr(destination, 1, 10) = 'synthetic:'),
  token TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('claimed', 'sent', 'retryable', 'rejected', 'uncertain_manual_review')),
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  message_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, transition_id, destination),
  FOREIGN KEY (event_id, transition_id) REFERENCES event_versions(event_id, transition_id)
);
CREATE INDEX synthetic_deliveries_state_time ON synthetic_deliveries (state, updated_at DESC);

-- D1 batches run transactionally. A failing CHECK in this first statement aborts
-- the entire batch before any snapshot writes can commit.
CREATE TABLE commit_guards (
  guard_id TEXT PRIMARY KEY,
  allowed INTEGER NOT NULL CHECK (allowed = 1)
);
