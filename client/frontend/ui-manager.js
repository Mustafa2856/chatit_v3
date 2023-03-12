let lastMessageTimestamp = 1;
let messagesBuffer = {};
let userList = [];
let groupList = {};
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
  let username = sessionStorage.getItem("userMessageWindow");
  let message = document.getElementById("messageInput").value;
  if (username == "") return;
  await serverconnect.sendMessage(username, message);
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
    addUserToChat(user);
  }
  try {
    sessionStorage.setItem("userMessageWindow", Object.keys(response)[0])
    document.getElementById("messageWindow").innerHTML = ""
  } catch (error) {
    // no messages
  }
}

const updateMessagesBuffer = async (msg) => {
  let username = sessionStorage.getItem('username')
  msg.body = await serverconnect.getMessageFromIPFSUI(username, msg.content_address)
  let user = msg.sender
  if(msg.sender == username)user = msg.receiver
  if (messagesBuffer[user]) {
    messagesBuffer[user] = messagesBuffer[user].concat([msg])
  } else {
    messagesBuffer[user] = [msg]
  }
  addUserToChat(user);
}

const updateMessageListUI = () => {
  let sender = sessionStorage.getItem("userMessageWindow");
  let receiver = sessionStorage.getItem("username");
  let messagesList = messagesBuffer[sender];
  let innerHTML = "";

  if (!messagesList) return;
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
  // TODO :: fix groups in namespcae first
  // if (user.startsWith("group-")) {
  //   user = user.slice(6)
  //   let groupname = user.slice(user.indexOf("-") + 1)
  //   let groupid = parseInt(user.slice(0, user.indexOf("-")))
  //   if (groupList[groupname] != undefined) {
  //     if (groupList[groupname] < groupid) groupList[groupname] = groupid;
  //     return;
  //   }
  //   groupList[groupname] = groupid
  //   let htmlString1 = "<li class=\"p-2 border-bottom\" id='group-";
  //   let htmlString2 = "' onclick='sessionStorage.setItem(\"userMessageWindow\",\"group-";
  //   let htmlString3 = "\");getMessagesOfUser(\"group-";
  //   let htmlString4 = "\")'>\
  //       <div class=\"d-flex flex-row\">\
  //         <div class=\"pt-1\">\
  //           <p class=\"fw-bold mb-0\">";
  //   let htmlString5 = "</p>\
  //         </div>\
  //       </div>\
  //   </li>";
  //   let innerHTML = "";
  //   innerHTML += htmlString1 + user + htmlString2 + user + htmlString3 + user + htmlString4 + groupname + htmlString5;
  //   document.getElementById("userList").innerHTML += innerHTML;
  //   return
  // }
  if (userList.includes(user)) return;
  userList.push(user);
  let innerHTML =
    `<li class="p-2 border-bottom" id='${user}' onclick='sessionStorage.setItem("userMessageWindow","${user}");updateMessageListUI()'>
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
  groupname = await serverconnect.createGroup(groupname, userList)
  if (groupname != undefined) addUserToChat(groupname)
}