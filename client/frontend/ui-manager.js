let lastMessageTimestamp = 1;
let messagesBuffer = {};
let userList = [];
let groupList = {};

const login = async (username, password) => {
  await serverconnect.loginUser(username, password);
  window.location.replace("messages.html");
}

const register = async (username, email, password) => {
  let successful = await serverconnect.registerUser(username, email, password);
  console.log(successful)
  if (successful) window.location.replace("messages.html");
}

const sendMessage = async (username, message) => {
  if (username == "") return;
  await serverconnect.sendMessage(username, message);
  getMessagesOfUser(username);
}

const getMessages = async () => {
  let response = await serverconnect.getMessages(1);
  for (var user in response) {
    addUserToChat(user);
  }
  try {
    sessionStorage.setItem("userMessageWindow", Object.keys(response)[0])
    lastMessageTimestamp = 1;
    messagesBuffer = {};
    document.getElementById("messageWindow").innerHTML = ""
  } catch (error) {
    // no messages
  }
}

const getMessagesOfUser = async () => {
  let username = sessionStorage.getItem("userMessageWindow");
  let receiver = sessionStorage.getItem("username")
  let response = await serverconnect.getMessages(lastMessageTimestamp);
  for (user in response) {
      if (messagesBuffer[user]) {
        messagesBuffer[user] = messagesBuffer[user].concat(response[user])
      } else {
        messagesBuffer[user] = response[user]
      }
      if (lastMessageTimestamp < response[user][response[user].length - 1].timestamp)
        lastMessageTimestamp = response[user][response[user].length - 1].timestamp;
      addUserToChat(user);
  }
  const receivedMessageString1 = "<li class=\"d-flex justify-content-start small p-2 ms-3 mb-1 rounded-3 bg\">\
  <div class=\"card\">\
  <div class=\"card-header d-flex justify-content-between p-3\" style=\"background-color:rgb(229, 255, 223)\">\
  <p class=\"fw-bold mb-0\">"
  const receivedMessageString1_1 = "</p>\
</div>\
    <div class=\"card-body\" style=\"background-color:rgb(229, 255, 223)\">\
      <pre>"
  const receivedMessageString2 = "</pre><span class=\"tooltiptext\">"
  const receivedMessageString3 = "</span>\
      <p class=\"text-muted small mb-0\"><i class=\"far fa-clock\"></i>"
  const receivedMessageString4 = "</p>\
    </div>\
  </div>\
</li>";
  const sentMessageString1 = "<li class=\"d-flex justify-content-end small p-2 ms-3 mb-1 rounded-3\">\
<div class=\"card\">\
<div class=\"card-header d-flex justify-content-between p-3\" style=\"background-color:rgb(223, 243, 255)\">\
  <p class=\"fw-bold mb-0\">"
  const sentMessageString1_1 = "</p>\
  </div>\
  <div class=\"card-body\" style=\"background-color:rgb(223, 243, 255)\">\
    <pre>"
  const sentMessageString2 = "</pre><span class=\"tooltiptext\">"
  const sentMessageString3 = "</span>\
    <p class=\"text-muted small mb-0\"><i class=\"far fa-clock\"></i>"
  const sentMessageString4 = "</p>\
  </div>\
</div>\
<div class=\"d-flex\"> </div>\
</li>";
  const messageInput = "<div class=\"bg-white mb-3\">\
  <div class=\"form-outline\">\
    <textarea class=\"form-control\" id=\"messageInput\" rows=\"4\"></textarea>\
  </div>\
</div>\
<button type=\"button\" class=\"btn btn-info btn-rounded float-end\" onclick=\"sendMessage('"
    + username
    + "',document.getElementById('messageInput').value)\">Send</button>";
  let messageInputValue = ""
  if (messagesBuffer[username] == undefined) {
    if (document.getElementById("messageInput") != null) messageInputValue = document.getElementById("messageInput").value;
    document.getElementById("messageWindow").innerHTML = "";
    document.getElementById("messageInputWindow").innerHTML = messageInput;
    document.getElementById("messageInput").value = messageInputValue;
    return
  }
  let messages = messagesBuffer[username];
  let innerHTML = "";
  for (var message of messages) {
    if (receiver != message.sender) {
      // received message
      innerHTML = receivedMessageString1
        + message.sender
        + receivedMessageString1_1
        + message.body
        + receivedMessageString2
        + "Content-Id: " + message["content_address"] + "<br/>Signature: " + message["signature"]
        + receivedMessageString3
        + getStringTime(message.timestamp)
        + receivedMessageString4
        + innerHTML
    } else {
      // sent message
      innerHTML = sentMessageString1
        + message.sender
        + sentMessageString1_1
        + message.body
        + sentMessageString2
        + "Content-Id: " + message["content_address"] + "<br/>Signature: " + message["signature"]
        + sentMessageString3
        + getStringTime(message.timestamp)
        + sentMessageString4
        + innerHTML
    }
  }

  if (document.getElementById("messageInput") != null) messageInputValue = document.getElementById("messageInput").value;
  document.getElementById("messageWindow").innerHTML = innerHTML;
  let focus = false;
  if(document.getElementById('messageInput') == document.activeElement)focus = true;
  document.getElementById("messageInputWindow").innerHTML = messageInput;
  document.getElementById("messageInput").value = messageInputValue;
  if(focus)document.getElementById("messageInput").focus();
}

const getStringTime = (timestamp) => {
  let strTime = new Date(timestamp * 1000).toUTCString();
  return strTime.substring(0, strTime.lastIndexOf(' '))
}

const getMessagesLoop = async () => {
  await getMessagesOfUser();
  setTimeout(getMessagesLoop, 5000);
}

const addUserToChat = (user) => {
  if (user == "") return;
  if (user.startsWith("group-")) {
    user = user.slice(6)
    let groupname = user.slice(user.indexOf("-") + 1)
    let groupid = parseInt(user.slice(0, user.indexOf("-")))
    if (groupList[groupname] != undefined) {
      if (groupList[groupname] < groupid) groupList[groupname] = groupid;
      return;
    }
    groupList[groupname] = groupid
    let htmlString1 = "<li class=\"p-2 border-bottom\" id='group-";
    let htmlString2 = "' onclick='sessionStorage.setItem(\"userMessageWindow\",\"group-";
    let htmlString3 = "\");getMessagesOfUser(\"group-";
    let htmlString4 = "\")'>\
        <div class=\"d-flex flex-row\">\
          <div class=\"pt-1\">\
            <p class=\"fw-bold mb-0\">";
    let htmlString5 = "</p>\
          </div>\
        </div>\
    </li>";
    let innerHTML = "";
    innerHTML += htmlString1 + user + htmlString2 + user + htmlString3 + user + htmlString4 + groupname + htmlString5;
    document.getElementById("userList").innerHTML += innerHTML;
    return
  }
  if (userList.includes(user)) return;
  userList.push(user);
  let htmlString1 = "<li class=\"p-2 border-bottom\" id='";
  let htmlString2 = "' onclick='sessionStorage.setItem(\"userMessageWindow\",\"";
  let htmlString3 = "\");getMessagesOfUser(\"";
  let htmlString4 = "\")'>\
        <div class=\"d-flex flex-row\">\
          <div class=\"pt-1\">\
            <p class=\"fw-bold mb-0\">";
  let htmlString5 = "</p>\
          </div>\
        </div>\
    </li>";
  let innerHTML = "";
  innerHTML += htmlString1 + user + htmlString2 + user + htmlString3 + user + htmlString4 + user + htmlString5;
  document.getElementById("userList").innerHTML += innerHTML;
}

const createGroup = async (groupname, userList) => {
  userList = userList.split(", ")
  groupname = await serverconnect.createGroup(groupname,userList)
  if(groupname != undefined)addUserToChat(groupname)
}