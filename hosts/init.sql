DROP TABLE IF EXISTS messages;
DROP FUNCTION IF EXISTS new_message_trigger;

CREATE TABLE messages (
     content_address TEXT PRIMARY KEY,
     sender TEXT,
     receiver TEXT,
     sent_time TIMESTAMP,
     signature BYTEA
);

CREATE UNIQUE INDEX messages_index ON messages (content_address) INCLUDE (sender, receiver, sent_time);

CREATE FUNCTION new_message_trigger()
RETURNS TRIGGER AS $$
BEGIN
	PERFORM pg_notify('new:message', NEW.content_address::text);
	RETURN NULL;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER new_message_trigger
AFTER INSERT ON messages
FOR EACH ROW EXECUTE PROCEDURE new_message_trigger();
