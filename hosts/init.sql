DROP TABLE IF EXISTS messages;
DROP FUNCTION IF EXISTS new_message_trigger;

CREATE TABLE messages (
     content_address TEXT,
     content_type TEXT,
     sender TEXT,
     group_id BYTEA,
     group_version INT,
     receiver TEXT,
     sent_time TIMESTAMP,
     signature BYTEA,
     is_group BOOLEAN,
     PRIMARY KEY (content_address, receiver)
);

CREATE UNIQUE INDEX messages_index ON messages (content_address, receiver) INCLUDE (sender, sent_time);

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
