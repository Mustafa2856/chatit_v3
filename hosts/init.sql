-- DROP TABLE IF EXISTS messages;
-- DROP TABLE IF EXISTS groupMessages;
-- DROP TABLE IF EXISTS groupMembership;
-- DROP TABLE IF EXISTS groups;
-- DROP TABLE IF EXISTS userinfo;
-- CREATE TABLE userinfo (
--     username TEXT PRIMARY KEY,
--     email TEXT NOT NULL UNIQUE,
--     private_key BYTEA,
--     public_key BYTEA
-- );
-- CREATE TABLE groups (
--     groupId SERIAL PRIMARY KEY,
--     groupname TEXT NOT NULL,
--     adminUser TEXT,
--     latest BOOLEAN,
--     UNIQUE (groupName, latest),
--     FOREIGN KEY (adminUser) REFERENCES userinfo(username) ON DELETE CASCADE
-- );
-- CREATE TABLE groupMembership (
--     groupId INT,
--     username TEXT,
--     aesKey TEXT,
--     PRIMARY KEY (groupId, username),
--     FOREIGN KEY (groupId) REFERENCES groups(groupId) ON DELETE CASCADE,
--     FOREIGN KEY (username) REFERENCES userinfo(username) ON DELETE CASCADE
-- );
-- CREATE TABLE groupMessages (
--     content_address TEXT PRIMARY KEY,
--     sender TEXT,
--     groupId INT,
--     sent_time TIMESTAMP,
--     signature BYTEA,
--     FOREIGN KEY (sender) REFERENCES userinfo(username) ON DELETE CASCADE,
--     FOREIGN KEY (groupId) REFERENCES groups(groupId) ON DELETE CASCADE
-- );
-- CREATE TABLE messages (
--     content_address TEXT PRIMARY KEY,
--     sender TEXT,
--     receiver TEXT,
--     sent_time TIMESTAMP,
--     signature BYTEA,
--     FOREIGN KEY (sender) REFERENCES userinfo(username) ON DELETE CASCADE,
--     FOREIGN KEY (receiver) REFERENCES userinfo(username) ON DELETE CASCADE
-- );
-- CREATE UNIQUE INDEX login_info_index ON userinfo (username) INCLUDE (private_key, public_key);
-- CREATE UNIQUE INDEX messages_index ON messages (content_address) INCLUDE (sender, receiver, sent_time);
-- CREATE UNIQUE INDEX groups_index ON groups (groupId) INCLUDE (groupname, adminUser);
-- CREATE UNIQUE INDEX group_membership ON groupMembership (groupId, username) INCLUDE (aesKey);
-- CREATE UNIQUE INDEX group_messages_index ON groupMessages (content_address) INCLUDE (sender, groupId, sent_time);

