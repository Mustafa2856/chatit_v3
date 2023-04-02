package main

import (
	"database/sql"
	"log"
	"time"

	"github.com/lib/pq"
)

func db_setup() (*sql.DB, chan Message) {
	connString := "postgres://locallookup:1234@psql:5432/chatit?sslmode=disable"
	db, err := sql.Open("postgres", connString)
	if err != nil {
		panic(err)
	} else if db.Ping() != nil {
		panic(db.Ping())
	}

	listener := pq.NewListener(connString, time.Millisecond, time.Millisecond, connectToChannel)
	newMessageChannel := make(chan Message)
	go listenDB(db, listener, "new:message", newMessageChannel)

	//defer listener.Close()
	return db, newMessageChannel
}

func connectToChannel(event pq.ListenerEventType, err error) {
	if err != nil {
		panic(err)
	}
	if event == pq.ListenerEventConnectionAttemptFailed {
		println("Connection Attempt Failed")
	}
}

func listenDB(db *sql.DB, listener *pq.Listener, channel string, newMessageChannel chan<- Message) {
	if err := listener.Listen(channel); err != nil {
		panic(err)
	}
	log.Println("Listening: ")
	for {
		e := <-listener.Notify
		if e == nil {
			continue
		}
		content_address := e.Extra
		row := db.QueryRow("SELECT content_address, content_type, sender, group_id, group_version, receiver, cast(extract(epoch from sent_time) as integer) sent_time, signature, is_group FROM messages WHERE content_address = $1", content_address)
		var newMessage Message
		if err := row.Scan(
			&newMessage.ContentAddress,
			&newMessage.ContentType,
			&newMessage.Sender,
			&newMessage.GroupId,
			&newMessage.GroupVersion,
			&newMessage.Receiver,
			&newMessage.Timestamp,
			&newMessage.Signature,
			&newMessage.IsGroup,
		); err != nil {
			panic(err)
		}
		newMessageChannel <- newMessage
	}
}
