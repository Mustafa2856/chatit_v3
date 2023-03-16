let lastMessageTimestamp = 1;
let messagesBuffer = {};
let userList = [];
let groupList = [];
var msgStream;

const login = async (username, password) => {
  let successful = await serverconnect.loginUser(username, password).catch((err) => { console.log(err) });
  if (successful) window.location.replace("messages.html");
}

const register = async (username, email, password) => {
  let successful = await serverconnect.registerUser(username, email, password);
  if (successful) window.location.replace("messages.html");
}

const sendMessage = async () => {
  let isGroup = sessionStorage.getItem("isGroup");
  let message = document.getElementById("messageInput").value;
  if (isGroup == "true") {
    let group = sessionStorage.getItem("groupMessageWindow")
    if (group == null || group == undefined) return;
    group = group.split(",");
    let groupid = group[0];
    let version = group[1];
    if (groupid == "") return;
    await serverconnect.sendGroupMessage(groupid, version, message);
  } else {
    let username = sessionStorage.getItem("userMessageWindow");
    if (username == "") return;
    await serverconnect.sendMessage(username, message);
  }
  document.getElementById("messageInput").value = "";
}

const getMessages = async () => {
  let response = await serverconnect.getMessages(1);
  messagesBuffer = {};
  for (user in response) {
    if (messagesBuffer[user]) {
      messagesBuffer[user] = messagesBuffer[user].concat(response[user])
    } else {
      messagesBuffer[user] = response[user]
    }
    if (lastMessageTimestamp < response[user][response[user].length - 1].timestamp)
      lastMessageTimestamp = response[user][response[user].length - 1].timestamp;
    if (!response[user][0].is_group) addUserToChat(user);
  }
  try {
    document.getElementById("messageWindow").innerHTML = ""
  } catch (error) {
    // no messages
  }
}

const getGroups = async () => {
  let list = await serverconnect.getGroupList();
  let innerHTML = "";
  for (let group of list) {
    innerHTML += `<li class="p-2 border-bottom" id='${group.id}' 
    onclick='sessionStorage.setItem("groupMessageWindow","${group.id},${group.version}");sessionStorage.setItem("isGroup","true");updateMessageListUI()'>
    <div class="d-flex flex-row">
      <div class="pt-1">
        <p class="fw-bold mb-0">${group.name}</p>
      </div>
    </div>
  </li>`;
  }
  document.getElementById("groupList").innerHTML = innerHTML;
}

const updateMessagesBuffer = async (msg) => {
  let username = sessionStorage.getItem('username')
  if (msg.is_group) {
    msg.body = await serverconnect.getGroupMessageFromIPFSUI(msg.groupid, msg.group_version, username, msg.content_address);
  } else {
    msg.body = await serverconnect.getMessageFromIPFSUI(username, msg.content_address)
  }
  let user = msg.sender
  if (msg.sender == username) user = msg.receiver
  if (msg.is_group) user = msg.groupid;
  if (messagesBuffer[user]) {
    messagesBuffer[user] = messagesBuffer[user].concat([msg])
  } else {
    messagesBuffer[user] = [msg]
  }
  if(!msg.is_group)addUserToChat(user);
}

const updateMessageListUI = () => {
  let isGroup = sessionStorage.getItem("isGroup");
  let sender = sessionStorage.getItem("userMessageWindow");
  let group = sessionStorage.getItem("groupMessageWindow");
  let receiver = sessionStorage.getItem("username");
  let messagesList = messagesBuffer[sender];
  let innerHTML = "";

  if (isGroup == "true") {
    messagesList = messagesBuffer[group.split(",")[0]];
  }

  if (!messagesList) {
    document.getElementById("messageWindow").innerHTML = "";
    return;
  }
  for (var message of messagesList) {
    if (receiver == message.sender) {
      let sentMessageCardHtml =
        `<li class="d-flex justify-content-end small p-2 ms-3 mb-1 rounded-3 bg">
  <div class="card">
    <div class="card-header d-flex justify-content-between p-3" style="background-color:rgb(223, 243, 255)">
      <p class="fw-bold mb-0">${message.sender}</p>
    </div>
    <div class="card-body" style="background-color:rgb(223, 243, 255)">
      <pre>${message.body}</pre>
      <span class="tooltiptext">
      Content-Id: ${message.content_address}<br/>
      Signature:  ${message.signature}
      </span>
      <p class="text-muted small mb-0">
        <i class="far fa-clock"></i>
        ${getStringTime(message.timestamp)}
      </p>
    </div>
  </div>
  <div class="d-flex"></div>
</li>`;
      innerHTML = sentMessageCardHtml + innerHTML;
    } else {
      let receivedMessageCardHtml =
        `<li class="d-flex justify-content-start small p-2 ms-3 mb-1 rounded-3 bg">
  <div class="card">
    <div class="card-header d-flex justify-content-between p-3" style="background-color:rgb(229, 255, 223)">
      <p class="fw-bold mb-0">${message.sender}</p>
    </div>
    <div class="card-body" style="background-color:rgb(229, 255, 223)">
      <pre>${message.body}</pre>
      <span class="tooltiptext">
      Content-Id: ${message.content_address}<br/>
      Signature:  ${message.signature}
      </span>
      <p class="text-muted small mb-0">
        <i class="far fa-clock"></i>
        ${getStringTime(message.timestamp)}
      </p>
    </div>
  </div>
</li>`;
      innerHTML = receivedMessageCardHtml + innerHTML;
    }
  }
  document.getElementById("messageWindow").innerHTML = innerHTML
}

const getStringTime = (timestamp) => {
  let strTime = new Date(timestamp * 1000).toUTCString();
  return strTime.substring(0, strTime.lastIndexOf(' '))
}

const addUserToChat = (user) => {
  if (user == "") return;
  if (userList.includes(user)) return;
  userList.push(user);
  let innerHTML =
    `<li class="p-2 border-bottom" id='${user}' onclick='sessionStorage.setItem("isGroup","false");sessionStorage.setItem("userMessageWindow","${user}");updateMessageListUI()'>
  <div class="d-flex flex-row">
    <div class="pt-1">
      <p class="fw-bold mb-0">${user}</p>
    </div>
  </div>
</li>`;
  document.getElementById("userList").innerHTML += innerHTML;
}

const createGroup = async (groupname, userList) => {
  userList = userList.split(", ")
  group = await serverconnect.createGroup(groupname, userList)
  if (group) {
    getGroups();
  }
}