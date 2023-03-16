package main

import (
	"database/sql"
	"encoding/base64"
	"io"
	"net/http"
	"sort"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Message struct {
	ContentAddress string `json:"content_address" binding:"required"`
	Sender         string `json:"sender" binding:"required"`
	GroupId        []byte `json:"groupid" binding:"required"`
	GroupVersion   uint64 `json:"group_version"`
	Receiver       string `json:"receiver" binding:"required"`
	Timestamp      uint64 `json:"timestamp"`
	Signature      []byte `json:"signature" binding:"required"`
	IsGroup        bool   `json:"is_group"`
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
	listeners = make(map[string]chan Message)
	go messageRelay()
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
			if listeners[message.Sender] != nil {
				listeners[message.Sender] <- message
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
		println(err.Error())
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if request.Sender == request.Receiver {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if check, err := verifySignature(request.Sender, []byte(request.ContentAddress)[0:31], request.Signature); !check || err != nil {
		println(err.Error())
		c.AbortWithStatus(http.StatusUnauthorized)
	} else {
		// message verified from sender
		if _, err := db.Exec("INSERT INTO messages (content_address, sender, group_id, group_version, receiver, sent_time, signature, is_group) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6,$7)",
			request.ContentAddress,
			request.Sender,
			request.GroupId,
			request.GroupVersion,
			request.Receiver,
			request.Signature,
			request.IsGroup); err != nil {
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
		sentMessageRows, err := db.Query("SELECT content_address, sender, group_id, group_version, receiver, cast(extract(epoch from sent_time) as integer) sent_time, signature, is_group FROM messages WHERE sender = $1 AND cast(extract(epoch from sent_time) as integer) > $2", username, timestamp)
		if err != nil {
			println(err.Error())
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		for sentMessageRows.Next() {
			sentMessageRows.Scan(
				&message.ContentAddress,
				&message.Sender,
				&message.GroupId,
				&message.GroupVersion,
				&message.Receiver,
				&message.Timestamp,
				&message.Signature,
				&message.IsGroup)
			if message.IsGroup {
				if messageList, ok := response[base64.StdEncoding.EncodeToString(message.GroupId)]; ok {
					messageList = append(messageList, message)
					response[base64.StdEncoding.EncodeToString(message.GroupId)] = messageList
				} else {
					messageList = []Message{message}
					response[base64.StdEncoding.EncodeToString(message.GroupId)] = messageList
				}
			} else if messageList, ok := response[message.Receiver]; ok {
				messageList = append(messageList, message)
				response[message.Receiver] = messageList
			} else {
				messageList = []Message{message}
				response[message.Receiver] = messageList
			}
		}
		receivedMessageRows, err := db.Query("SELECT content_address, sender, group_id, group_version, receiver, cast(extract(epoch from sent_time) as integer) sent_time, signature, is_group FROM messages WHERE receiver = $1 AND cast(extract(epoch from sent_time) as integer) > $2", username, timestamp)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		for receivedMessageRows.Next() {
			receivedMessageRows.Scan(
				&message.ContentAddress,
				&message.Sender,
				&message.GroupId,
				&message.GroupVersion,
				&message.Receiver,
				&message.Timestamp,
				&message.Signature,
				&message.IsGroup)
			if message.IsGroup {
				if messageList, ok := response[base64.StdEncoding.EncodeToString(message.GroupId)]; ok {
					messageList = append(messageList, message)
					response[base64.StdEncoding.EncodeToString(message.GroupId)] = messageList
				} else {
					messageList = []Message{message}
					response[base64.StdEncoding.EncodeToString(message.GroupId)] = messageList
				}
			} else if messageList, ok := response[message.Sender]; ok {
				messageList = append(messageList, message)
				response[message.Sender] = messageList
			} else {
				messageList = []Message{message}
				response[message.Sender] = messageList
			}
		}

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
