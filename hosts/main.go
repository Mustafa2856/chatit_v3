package main

func main() {
	db, newMessageChannel := db_setup()
	api_setup(db, newMessageChannel)
}
