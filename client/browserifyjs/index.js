import { decrypt, generatePrivate, getPublic, encrypt, sign } from 'eccrypto';
import ipfsClient from 'ipfs-http-client';

const ipfs = ipfsClient('http://localhost:5001/api/v0');

var serverURL = 'http://localhost:5000'
var namespaceURL = 'http://localhost:3000' 
let msgStream;

const getAESKey = async (username, password) => {
    let encoder = new TextEncoder();
    let secretKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(username + password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
    );
    let AESKey = await crypto.subtle.deriveKey({
        "name": "PBKDF2",
        salt: Buffer.from(username),
        "iterations": 100000,
        "hash": "SHA-256"
    },
        secretKey,
        { "name": "AES-CBC", "length": 256 },
        true,
        ["encrypt", "decrypt"]
    );
    return AESKey;
}

const saveUserKeys = (username, publicKey, privateKey) => {
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('publicKey', publicKey);
    sessionStorage.setItem('privateKey', privateKey);
}

const encryptMessage = async (message, aesKey) => {
    let AESKey;
    if (aesKey != undefined) AESKey = aesKey;
    else {
        AESKey = await crypto.subtle.generateKey(
            {
                name: "AES-CBC",
                length: 256
            }
            , true, ["encrypt", "decrypt"]
        );
    }
    let IV = crypto.getRandomValues(new Uint8Array(16));
    let encryptedMessage = await crypto.subtle.encrypt(
        {
            name: "AES-CBC",
            iv: IV,
        },
        AESKey,
        message
    );
    return { AESKey, IV, encryptedMessage };
}

const getMessageFromIPFS = async (username, privateKey, content_address) => {
    let body = ipfs.get(content_address)
    for await (const byte of ipfs.get(content_address)) {
        for await (const content of byte.content) {
            body = Buffer.from(content).toString()
        }
    }

    //decrypt and structure the message
    body = body.split("\n")
    let message = { "sender": body[0], "receiver": body[1] };
    let senderIV = Buffer.from(body[2], "base64");
    let receiverIV = Buffer.from(body[3], "base64");
    let IV = Buffer.from(body[4], "base64");
    let senderKey = JSON.parse(body[5]);
    let receiverKey = JSON.parse(body[6]);
    senderKey = {
        "ciphertext": Buffer.from(senderKey["ciphertext"]["data"]),
        "iv": senderIV,
        "ephemPublicKey": Buffer.from(senderKey["ephemPublicKey"]["data"]),
        "mac": Buffer.from(senderKey["mac"]["data"])
    };
    receiverKey = {
        "ciphertext": Buffer.from(receiverKey["ciphertext"]["data"]),
        "iv": receiverIV,
        "ephemPublicKey": Buffer.from(receiverKey["ephemPublicKey"]["data"]),
        "mac": Buffer.from(receiverKey["mac"]["data"])
    };
    let encryptedMessage = Buffer.from(body[7], "base64");
    let AESKeyBytes
    if (message.sender == username) AESKeyBytes = await decrypt(privateKey, senderKey)
    else AESKeyBytes = await decrypt(privateKey, receiverKey)
    let AESKey = await crypto.subtle.importKey("raw", AESKeyBytes, {
        name: "AES-CBC",
        iv: IV,
    }, true, ["encrypt", "decrypt"]);

    let decryptedMessage = await crypto.subtle.decrypt({
        name: "AES-CBC",
        iv: IV,
    },
        AESKey,
        encryptedMessage)
    return Buffer.from(decryptedMessage).toString()
}

const getGroupMessageFromIPFS = async (group, username, privateKey, content_address) => {
    group = group.slice(6)
    let groupid = group.slice(0, group.indexOf("-"))
    let groupAESKey = sessionStorage.getItem('aeskey-' + group + username);

    // get group aes key if not in storage
    if (groupAESKey == null || groupAESKey == undefined) {
        let getAESKeyResponse = await fetch(serverURL + "/group-aes-key/" + groupid + "/" + username, {
            method: "GET",
            cache: "no-cache"
        });

        if (getAESKeyResponse.ok) {
            groupAESKey = await getAESKeyResponse.text()
            sessionStorage.setItem('aeskey-' + group + username, groupAESKey)
            groupAESKey = Buffer.from(groupAESKey, 'base64');
        } else return;
    } else {
        groupAESKey = Buffer.from(groupAESKey, 'base64');
    }

    // decrypting group aes key
    groupAESKey = await JSON.parse(groupAESKey.toString())
    groupAESKey.ciphertext = Buffer.from(groupAESKey.ciphertext, 'base64')
    groupAESKey.ephemPublicKey = Buffer.from(groupAESKey.ephemPublicKey, 'base64')
    groupAESKey.iv = Buffer.from(groupAESKey.iv, 'base64')
    groupAESKey.mac = Buffer.from(groupAESKey.mac, 'base64')
    try {
        groupAESKey = await decrypt(privateKey, groupAESKey)
        groupAESKey = await crypto.subtle.importKey("raw", groupAESKey, {
            name: "AES-CBC",
        }, true, ["encrypt", "decrypt"]);
    } catch (error) {
        console.log(error)
        return ""
    }
    // get message body from IPFS
    let body = ipfs.get(content_address)
    for await (const byte of ipfs.get(content_address)) {
        for await (const content of byte.content) {
            body = Buffer.from(content).toString()
        }
    }

    //decrypt and structure the message
    body = body.split("\n")
    let IV = Buffer.from(body[2], "base64");
    let encryptedMessage = Buffer.from(body[3], "base64");
    let decryptedMessage = await crypto.subtle.decrypt({
        name: "AES-CBC",
        iv: IV,
    },
        groupAESKey,
        encryptedMessage)
    return Buffer.from(decryptedMessage).toString()
}

const registerUser = async (username, email, password) => {
    let privateKey = generatePrivate();
    let publicKey = getPublic(privateKey);
    // bad mac for some random keys -- to replace this with proper solution
    while (await tryBadMac(privateKey, publicKey)) {
        privateKey = generatePrivate();
        publicKey = getPublic(privateKey);
    }
    let AESKey = await getAESKey(username, password);
    let iv = Buffer.from((username + 'username12345678901234567890').slice(0, 16));
    let encryptedPrivateKey = await crypto.subtle.encrypt({
        name: "AES-CBC",
        iv: iv,
    }, AESKey, privateKey);
    let publicKeyString = publicKey.toString('base64');
    let encryptedPrivateKeyString = Buffer.from(encryptedPrivateKey).toString('base64');

    let response = await fetch(namespaceURL + "/" + username, {
        method: 'POST',
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
            'public_key': publicKeyString,
            'private_key': encryptedPrivateKeyString
        })
    });
    if (response.ok) {
        saveUserKeys(username, publicKeyString, privateKey.toString('base64'));
        return true;
    }
    return false;
}

const loginUser = async (username, password) => {
    let AESKey = await getAESKey(username, password)
    let iv = Buffer.from((username + 'username12345678901234567890').slice(0, 16));
    let response = await fetch(namespaceURL + "/" + username, {
        method: "GET",
        cache: "no-cache"
    })

    if (response.ok) {
        let keyPair = await response.json()
        console.log(Buffer.from(keyPair['private_key'], 'base64'),AESKey)
        let decryptedPrivateKey = await crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv: iv,
            },
            AESKey,
            Buffer.from(keyPair['private_key'], 'base64')
        ).catch((err)=>console.log("decrypt:",err) );
        saveUserKeys(username, keyPair['public_key'], Buffer.from(decryptedPrivateKey).toString('base64'));
        return true;
    } else {
        console.log('Login error');
        return false;
    }
}

const sendMessage = async (receiver, message) => {
    // if logged in
    if (sessionStorage.getItem('username') != null) {
        if (receiver.startsWith("group-")) {
            await sendGroupMessage(receiver, message)
            return
        }
        let sender = sessionStorage.getItem('username');
        let privateKey = Buffer.from(sessionStorage.getItem('privateKey'), 'base64');
        let senderPublicKey = Buffer.from(sessionStorage.getItem('publicKey'), 'base64');
        let receiverPublicKey = sessionStorage.getItem('pkey-' + receiver);

        // get public key if not in storage
        if (receiverPublicKey == null || receiverPublicKey == undefined) {
            let getPublicKeyResponse = await fetch(serverURL + "/get-public-key/" + receiver, {
                method: "GET",
                cache: "no-cache"
            });

            if (getPublicKeyResponse.ok) {
                receiverPublicKey = await getPublicKeyResponse.text()
                sessionStorage.setItem('pkey-' + receiver, receiverPublicKey)
                receiverPublicKey = Buffer.from(receiverPublicKey, 'base64');
            } else return;
        } else {
            receiverPublicKey = Buffer.from(receiverPublicKey, 'base64');
        }

        // encrypt message and keys
        let { AESKey, IV, encryptedMessage } = await encryptMessage(Buffer.from(message));
        let encryptedAESKeyReceiverIV = crypto.getRandomValues(new Uint8Array(16));
        let encryptedAESKeySenderIV = crypto.getRandomValues(new Uint8Array(16));
        let AESKeyBytes = await crypto.subtle.exportKey("raw", AESKey);
        AESKeyBytes = Buffer.from(AESKeyBytes);
        let encryptedAESKeyReceiver = await encrypt(receiverPublicKey, AESKeyBytes, { iv: encryptedAESKeyReceiverIV });
        let encryptedAESKeySender = await encrypt(senderPublicKey, AESKeyBytes, { iv: encryptedAESKeySenderIV });
        // final content to upload to ipfs
        let finalMessage =
            sender + '\n'
            + receiver + '\n'
            + Buffer.from(encryptedAESKeySenderIV).toString('base64') + '\n'
            + Buffer.from(encryptedAESKeyReceiverIV).toString('base64') + '\n'
            + Buffer.from(IV).toString('base64') + '\n'
            + JSON.stringify(encryptedAESKeySender) + '\n'
            + JSON.stringify(encryptedAESKeyReceiver) + '\n'
            + Buffer.from(encryptedMessage).toString('base64');
        let response = await ipfs.add(Buffer.from(finalMessage));
        let content_address_clipped = Buffer.from(response.path).subarray(0, 32);

        // sign and send cid to service
        let signature = await sign(privateKey, content_address_clipped);
        await fetch(serverURL + "/send-message", {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
            },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({
                'content_address': response.path,
                'sender': sender,
                'receiver': receiver,
                'signature': signature.toString('base64')
            })
        });
    }
}

const getMessages = async (timestamp) => {
    // if logged in
    if (sessionStorage.getItem("username") != null) {
        let username = sessionStorage.getItem("username")
        let response = await fetch(serverURL + "/get-messages/" + username + "?timestamp=" + timestamp, {
            method: "GET",
            cache: "no-cache"
        });
        let allMessages = await response.json()
        // get message body for each message
        for (var user in allMessages) {
            if (user.startsWith("group-")) {
                for (var message of allMessages[user]) {
                    message["body"] = await getGroupMessageFromIPFS(user, username, Buffer.from(sessionStorage.getItem('privateKey'), 'base64'), message["content_address"])
                }
            } else {
                for (var message of allMessages[user]) {
                    message["body"] = await getMessageFromIPFS(username, Buffer.from(sessionStorage.getItem('privateKey'), 'base64'), message["content_address"])
                }
            }
        }

        return allMessages
    }
}

const getMessagesStream = () => {
    try {
        // close msg stream if exists
        msgStream.close()
    } catch(exception){
        // msgStream not already present
    }
    if (sessionStorage.getItem("username") != null) {
        let username = sessionStorage.getItem("username")
        msgStream = new EventSource(serverURL + "/get-messages-stream/" + username)
        return msgStream
    }
    throw new Error("user not logged in!")
    return null
}

const createGroup = async (groupName, userList) => {
    // if logged in
    if (sessionStorage.getItem("username") != null) {
        let username = sessionStorage.getItem("username");
        let privateKey = Buffer.from(sessionStorage.getItem('privateKey'), 'base64');
        let publicKey = Buffer.from(sessionStorage.getItem('publicKey'), 'base64');
        // aes key for new group
        let AESKey = await crypto.subtle.generateKey(
            {
                name: "AES-CBC",
                length: 256
            }
            , true, ["encrypt", "decrypt"]
        );
        let AESKeyBytes = await crypto.subtle.exportKey("raw", AESKey);
        AESKeyBytes = Buffer.from(AESKeyBytes);

        // get public keys of all group members
        let needPublicKeys = []
        let user
        for (user of userList) {
            if (sessionStorage.getItem('pkey-' + user) != null) {
                continue;
            }
            needPublicKeys.push(user)
        }
        if (needPublicKeys.length > 0) {
            let publicKeys = await fetch(serverURL + "/get-public-key-list", {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                },
                redirect: 'follow',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(needPublicKeys)
            });
            publicKeys = await publicKeys.json();
            for (user in publicKeys) {
                sessionStorage.setItem('pkey-' + user, publicKeys[user])
            }
        }
        // encrypt aes key for all users
        let encryptedAESKeys = []
        let encryptedAESKey
        let iv
        for (user of userList) {
            iv = crypto.getRandomValues(new Uint8Array(16))
            encryptedAESKey = await encrypt(Buffer.from(sessionStorage.getItem('pkey-' + user), 'base64'), AESKeyBytes, { iv: iv })

            encryptedAESKey.ciphertext = encryptedAESKey.ciphertext.toString('base64')
            encryptedAESKey.ephemPublicKey = encryptedAESKey.ephemPublicKey.toString('base64')
            encryptedAESKey.iv = Buffer.from(encryptedAESKey.iv).toString('base64')
            encryptedAESKey.mac = encryptedAESKey.mac.toString('base64')
            encryptedAESKey = JSON.stringify(encryptedAESKey)
            encryptedAESKeys[user] = encryptedAESKey
        }
        // encrypting for group admin
        iv = crypto.getRandomValues(new Uint8Array(16))
        encryptedAESKey = await encrypt(publicKey, AESKeyBytes, { iv: iv })
        encryptedAESKey.ciphertext = encryptedAESKey.ciphertext.toString('base64')
        encryptedAESKey.ephemPublicKey = encryptedAESKey.ephemPublicKey.toString('base64')
        encryptedAESKey.iv = Buffer.from(encryptedAESKey.iv).toString('base64')
        encryptedAESKey.mac = encryptedAESKey.mac.toString('base64')
        encryptedAESKey = JSON.stringify(encryptedAESKey)

        let UserKeyList = []
        for (user in encryptedAESKeys) {
            UserKeyList.push({ "username": user, "aes_key": encryptedAESKeys[user] })
        }

        // sign and send request to service
        let hashString = ""
        for (user of UserKeyList) {
            hashString += user.username
        }
        let hash = await crypto.subtle.digest("SHA-256", Buffer.from(hashString))
        hash = Buffer.from(hash)
        let signature = await sign(privateKey, hash);
        let response = await fetch(serverURL + "/create-group", {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
            },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({
                'username': username,
                'aes_key': encryptedAESKey,
                'group_name': groupName,
                'user_list': UserKeyList,
                'signature': signature.toString('base64')
            })
        });
        let group_name = await response.text();
        return group_name
    }
}

const updateGroupUserList = async (groupName, userList) => {
    // if logged in
    if (sessionStorage.getItem("username") != null) {
        let username = sessionStorage.getItem("username");
        let privateKey = Buffer.from(sessionStorage.getItem('privateKey'), 'base64');
        let publicKey = Buffer.from(sessionStorage.getItem('publicKey'), 'base64');
        // aes key for new group
        let AESKey = await crypto.subtle.generateKey(
            {
                name: "AES-CBC",
                length: 256
            }
            , true, ["encrypt", "decrypt"]
        );
        let AESKeyBytes = await crypto.subtle.exportKey("raw", AESKey);
        AESKeyBytes = Buffer.from(AESKeyBytes);

        // get public keys of all group members
        let needPublicKeys = []
        let user
        for (user of userList) {
            if (sessionStorage.getItem('pkey-' + user) != null) {
                continue;
            }
            needPublicKeys.push(user)
        }
        if (needPublicKeys.length > 0) {
            let publicKeys = await fetch(serverURL + "/get-public-key-list", {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                },
                redirect: 'follow',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(needPublicKeys)
            });
            publicKeys = await publicKeys.json();
            for (user in publicKeys) {
                sessionStorage.setItem('pkey-' + user, publicKeys[user])
            }
        }
        // encrypt aes key for all users
        let encryptedAESKeys = []
        let encryptedAESKey
        let iv
        for (user of userList) {
            iv = crypto.getRandomValues(new Uint8Array(16))
            encryptedAESKey = await encrypt(Buffer.from(sessionStorage.getItem('pkey-' + user), 'base64'), AESKeyBytes, { iv: iv })

            encryptedAESKey.ciphertext = encryptedAESKey.ciphertext.toString('base64')
            encryptedAESKey.ephemPublicKey = encryptedAESKey.ephemPublicKey.toString('base64')
            encryptedAESKey.iv = Buffer.from(encryptedAESKey.iv).toString('base64')
            encryptedAESKey.mac = encryptedAESKey.mac.toString('base64')
            encryptedAESKey = JSON.stringify(encryptedAESKey)
            encryptedAESKeys[user] = encryptedAESKey
        }
        // encrypting for group admin
        iv = crypto.getRandomValues(new Uint8Array(16))
        encryptedAESKey = await encrypt(publicKey, AESKeyBytes, { iv: iv })
        encryptedAESKey.ciphertext = encryptedAESKey.ciphertext.toString('base64')
        encryptedAESKey.ephemPublicKey = encryptedAESKey.ephemPublicKey.toString('base64')
        encryptedAESKey.iv = Buffer.from(encryptedAESKey.iv).toString('base64')
        encryptedAESKey.mac = encryptedAESKey.mac.toString('base64')
        encryptedAESKey = JSON.stringify(encryptedAESKey)

        let UserKeyList = []
        for (user in encryptedAESKeys) {
            UserKeyList.push({ "username": user, "aes_key": encryptedAESKeys[user] })
        }

        // sign and send request to service
        let hashString = ""
        for (user of UserKeyList) {
            hashString += user.username
        }
        let hash = await crypto.subtle.digest("SHA-256", Buffer.from(hashString))
        hash = Buffer.from(hash)
        let signature = await sign(privateKey, hash);
        let response = await fetch(serverURL + "/update-group-user-list", {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
            },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({
                'username': username,
                'aes_key': encryptedAESKey,
                'group_name': groupName,
                'user_list': UserKeyList,
                'signature': signature.toString('base64')
            })
        });
        let group_name = await response.text();
        return group_name
    }
}

const sendGroupMessage = async (group, message) => {
    group = group.slice(6)
    let groupid = group.slice(0, group.indexOf("-"))
    let sender = sessionStorage.getItem('username');
    let privateKey = Buffer.from(sessionStorage.getItem('privateKey'), 'base64');
    let groupAESKey = sessionStorage.getItem('aeskey-' + group + sender);

    // get group aes key if not in storage
    if (groupAESKey == null || groupAESKey == undefined) {
        let getAESKeyResponse = await fetch(serverURL + "/group-aes-key/" + groupid + "/" + sender, {
            method: "GET",
            cache: "no-cache"
        });

        if (getAESKeyResponse.ok) {
            groupAESKey = await getAESKeyResponse.text()
            sessionStorage.setItem('aeskey-' + group + sender, groupAESKey)
            groupAESKey = Buffer.from(groupAESKey, 'base64');
        } else return;
    } else {
        groupAESKey = Buffer.from(groupAESKey, 'base64');
    }

    // decrypting group aes key
    groupAESKey = await JSON.parse(groupAESKey.toString())
    groupAESKey.ciphertext = Buffer.from(groupAESKey.ciphertext, 'base64')
    groupAESKey.ephemPublicKey = Buffer.from(groupAESKey.ephemPublicKey, 'base64')
    groupAESKey.iv = Buffer.from(groupAESKey.iv, 'base64')
    groupAESKey.mac = Buffer.from(groupAESKey.mac, 'base64')
    groupAESKey = await decrypt(privateKey, groupAESKey)
    groupAESKey = await crypto.subtle.importKey("raw", groupAESKey, {
        name: "AES-CBC",
    }, true, ["encrypt", "decrypt"]);

    // encrypt message
    let { IV, encryptedMessage } = await encryptMessage(Buffer.from(message), groupAESKey);

    // final content to upload to ipfs
    let finalMessage =
        sender + '\n'
        + 'group-' + group + '\n'
        + Buffer.from(IV).toString('base64') + '\n'
        + Buffer.from(encryptedMessage).toString('base64');
    let response = await ipfs.add(Buffer.from(finalMessage));
    let content_address_clipped = Buffer.from(response.path).subarray(0, 32);

    // sign and send cid to service
    let signature = await sign(privateKey, content_address_clipped);
    await fetch(serverURL + "/send-message", {
        method: 'POST',
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
            'content_address': response.path,
            'sender': sender,
            'receiver': 'group-' + group,
            'signature': signature.toString('base64')
        })
    });
}

const tryBadMac = async (privateKey, publicKey) => {
    let sampleMessage = Buffer.from("abcdefghijklmnopqrstuvwxy1234567890")
    let iv = crypto.getRandomValues(new Uint8Array(16))
    try {
        let encryptedMessage = await encrypt(publicKey, sampleMessage, { iv: iv })
        let decryptedMessage = await decrypt(privateKey, encryptedMessage)
        console.log(decryptedMessage.toString() == sampleMessage.toString())
        return decryptedMessage.toString() != sampleMessage.toString()
    } catch (error) {
        return true;
    }
}

window.serverconnect = {
    'registerUser': registerUser,
    'loginUser': loginUser,
    'sendMessage': sendMessage,
    'getMessages': getMessages,
    'getMessagesStream':getMessagesStream,
    'createGroup': createGroup,
    'updateGroupUserList' : updateGroupUserList
}
