package main

import (
	"database/sql"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type Message struct {
	ContentAddress string `json:"content_address" binding:"required"`
	Sender         string `json:"sender" binding:"required"`
	Receiver       string `json:"receiver" binding:"required"`
	Timestamp      uint64 `json:"timestamp"`
	Signature      []byte `json:"signature" binding:"required"`
}

type Listener struct {
	Username string
	Channel  chan Message
}

var db *sql.DB
var msgChannel chan Message
var activeListeners chan Listener
var closeListener chan Listener
var listeners map[string]chan Message

func api_setup(db_ *sql.DB, _msgChannel chan Message) {
	db = db_
	msgChannel = _msgChannel
	activeListeners = make(chan Listener)

	service := gin.Default()
	service.SetTrustedProxies(nil)
	service.Use(CORSMiddleware())

	service.POST("/send-message", sendMessage)
	service.GET("/get-messages/:username", getMessages)
	service.GET("/get-messages-stream/:username", getMessagesSSE)

	ip := "0.0.0.0"
	port := "5000"
	address := ip + ":" + port
	service.Run(address)

	go messageRelay()
}

func messageRelay() {
	for {
		select {
		case listener := <-activeListeners:
			listeners[listener.Username] = listener.Channel
		case message := <-msgChannel:
			if listeners[message.Receiver] != nil {
				listeners[message.Receiver] <- message
			}
		case listener := <-closeListener:
			if listeners[listener.Username] != nil {
				listeners[listener.Username] = nil
			}
		}
	}
}

// send msg to other user
func sendMessage(c *gin.Context) {
	var request Message
	if err := c.BindJSON(&request); err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if request.Sender == request.Receiver {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if check, err := verifySignature(request.Sender, []byte(request.ContentAddress)[0:31], request.Signature); !check || err != nil {
		c.AbortWithStatus(http.StatusUnauthorized)
	} else {
		// message verified from sender

		// group message receiver is: group-#number#-#groupname# example: group-1-examplegroup
		if strings.Split(request.Receiver, "-")[0] == "group" {
			//c.AbortWithStatus(sendGroupMessage(request))
			// unimplemented
			return
		}
		if _, err := db.Exec("INSERT INTO messages (content_address, sender, receiver, sent_time, signature) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4)",
			request.ContentAddress,
			request.Sender,
			request.Receiver,
			request.Signature); err != nil {
			println(err.Error())
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		c.AbortWithStatus(http.StatusOK)
	}
}

// get messages of user after given timestamp
func getMessages(c *gin.Context) {
	username := c.Param("username")
	timestamp := c.Query("timestamp")
	if timestamp != "" {
		timestamp, err := strconv.ParseUint(timestamp, 10, 64)
		if err != nil {
			println(err.Error())
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		response := map[string][]Message{}
		var message Message
		sentMessageRows, err := db.Query("SELECT content_address, sender, receiver, cast(extract(epoch from sent_time) as integer) sent_time, signature FROM messages WHERE sender = $1 AND cast(extract(epoch from sent_time) as integer) > $2", username, timestamp)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		for sentMessageRows.Next() {
			sentMessageRows.Scan(
				&message.ContentAddress,
				&message.Sender,
				&message.Receiver,
				&message.Timestamp,
				&message.Signature)
			if messageList, ok := response[message.Receiver]; ok {
				messageList = append(messageList, message)
				response[message.Receiver] = messageList
			} else {
				messageList = []Message{message}
				response[message.Receiver] = messageList
			}
		}
		receivedMessageRows, err := db.Query("SELECT content_address, sender, receiver, cast(extract(epoch from sent_time) as integer) sent_time, signature FROM messages WHERE receiver = $1 AND cast(extract(epoch from sent_time) as integer) > $2", username, timestamp)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		for receivedMessageRows.Next() {
			receivedMessageRows.Scan(
				&message.ContentAddress,
				&message.Sender,
				&message.Receiver,
				&message.Timestamp,
				&message.Signature)
			if messageList, ok := response[message.Sender]; ok {
				messageList = append(messageList, message)
				response[message.Sender] = messageList
			} else {
				messageList = []Message{message}
				response[message.Sender] = messageList
			}
		}

		// groupMessages := getGroupMessages(username, timestamp)
		// for groupName, messages := range groupMessages {
		// 	response[groupName] = messages
		// }

		for _, messages := range response {
			sort.Slice(messages, func(i, j int) bool {
				return messages[i].Timestamp < messages[j].Timestamp
			})
		}

		c.AbortWithStatusJSON(http.StatusOK, response)
	} else {
		c.AbortWithStatus(http.StatusBadRequest)
	}
}

func getMessagesSSE(c *gin.Context) {
	username := c.Param("username")

	newMessageChannel := make(chan Message)
	activeListeners <- Listener{username, newMessageChannel}
	c.Stream(func(w io.Writer) bool {
		if msg, ok := <-newMessageChannel; ok {
			c.SSEvent("message", msg)
			return true
		}
		closeListener <- Listener{username, newMessageChannel}
		return false
	})
}

func verifySignature(sender string, hash []byte, signature []byte) (bool, error) {
	// get from namespace
	return true, nil
}

// to deal with cors policy replace * with actual address
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {

		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Header("Access-Control-Allow-Methods", "POST, HEAD, PATCH, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
