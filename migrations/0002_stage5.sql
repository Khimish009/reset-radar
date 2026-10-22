-- Local Stage 5 only. Real Telegram destinations/outcomes require a future adapter.
CREATE INDEX publication_candidates_pending_page
  ON publication_candidates(provider, state, created_at, transition_id);

CREATE TABLE telegram_simulation_deliveries (
  environment TEXT NOT NULL CHECK (environment = 'stage5_local_simulation'),
  event_id TEXT NOT NULL,
  transition_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (substr(destination, 1, 10) = 'synthetic:' AND length(destination) BETWEEN 11 AND 200),
  token TEXT NOT NULL CHECK (length(token) BETWEEN 1 AND 100),
  state TEXT NOT NULL CHECK (state IN ('claimed', 'simulated_sent', 'retryable', 'rejected', 'uncertain_manual_review')),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  retry_at TEXT,
  message_id INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (environment, event_id, transition_id, destination),
  FOREIGN KEY (event_id, transition_id) REFERENCES event_versions(event_id, transition_id),
  CHECK ((state = 'retryable' AND retry_at IS NOT NULL) OR (state <> 'retryable' AND retry_at IS NULL)),
  CHECK ((state = 'simulated_sent' AND message_id IS NOT NULL AND message_id > 0) OR (state <> 'simulated_sent' AND message_id IS NULL))
);
CREATE INDEX telegram_simulation_state_time ON telegram_simulation_deliveries(state, updated_at);
