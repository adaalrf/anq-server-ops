CREATE INDEX entries_cursor ON entries(occurred_at DESC, created_at DESC, id DESC);
CREATE INDEX entries_server_cursor ON entries(server_id, occurred_at DESC, created_at DESC, id DESC);
