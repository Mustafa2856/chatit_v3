package main

import (
	"database/sql"

	_ "github.com/lib/pq"
)

func db_setup() *sql.DB {
	db, err := sql.Open("postgres", "postgres://locallookup:1234@localhost:5432/chatit_v2")
	if err != nil {
		println(err.Error())
	} else if db.Ping() != nil {
		println(db.Ping().Error())
	}

	return db
}
