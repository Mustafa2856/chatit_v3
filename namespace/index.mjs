import express from 'express';
import bodyParser from 'body-parser';
import { databaseContract } from './chain.mjs';
import { verify } from 'eccrypto';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(bodyParser.json());
app.use(cors());
const port = 3000;

app.get('/u/:userId', async (req, res) => {
    const userDetails = await databaseContract.getUserInfo(req.params.userId);
    // user does not exist
    if (userDetails[0] == "") {
        res.sendStatus(404);
    }
    else {
        let response = {
            username: userDetails[0],
            private_key: Buffer.from(userDetails[1].substring(2), 'hex').toString('base64'),
            public_key: Buffer.from(userDetails[2].substring(2), 'hex').toString('base64'),
        }
        res.json(response);
    }
});

app.post('/u/:userId', async (req, res) => {

    const userId = req.params.userId;
    const privateKey = Buffer.from(req.body.private_key, 'base64');
    const publicKey = Buffer.from(req.body.public_key, 'base64');

    const userDetails = await databaseContract.getUserInfo(userId);

    // new account registration
    if (userDetails[0] == "") {
        const result = await databaseContract.addUserInfo(
            userId,
            privateKey,
            publicKey
        );
        res.json(result);
    }
    // account details update -- checking signature
    else {
        const signature = req.body.signature;
        // bad request
        if (!signature) {
            res.sendStatus(400);
            return;
        }
        const hashMsg = userId + privateKey + publicKey;
        try {
            await verify(
                Buffer.from(userDetails[2].substring(2), 'hex'),
                Buffer.from(hashMsg),
                Buffer.from(signature, 'base64')
            );
        } catch (exception) {
            res.sendStatus(400);
            return;
        }

        const result = await databaseContract.addUserInfo(
            userId,
            privateKey,
            publicKey
        );
        res.json(result);
    }
});

app.get('/p/:userId', async (req, res) => {
    const publicKey = await getPublicKey(req.params.userId);
    // user does not exist
    if (publicKey) {
        res.send(publicKey);
    }
    else {
        res.sendStatus(404);
    }
});

app.post('/p-list', async (req, res) => {
    const userList = req.body;
    const response = {};
    for(let user of userList){
        response[user] = await getPublicKey(user);
    }
    res.send(response);
});

const getPublicKey = async (username) => {
    const userDetails = await databaseContract.getUserInfo(username);
    // user does not exist
    if (userDetails[0] == "") {
        return null;
    }
    else {
        return Buffer.from(userDetails[2].substring(2), 'hex').toString('base64');
    }
}

app.post('/g/create', async (req, res) => {

    const username = req.body.username;
    const groupname = req.body.group_name;
    const admin_user_list = req.body.admin_users;
    const other_user_list = req.body.other_users;
    const signature = req.body.signature;

    const hashString = username + JSON.stringify(admin_user_list) + groupname + JSON.stringify(other_user_list);
    let hash = await crypto.subtle.digest("SHA-256", Buffer.from(hashString));
    const publicKey = await getPublicKey(username);
    if(publicKey == null) {
        res.sendStatus(404);
    } else {
        try {
            await verify(
                Buffer.from(Buffer.from(publicKey,'base64')),
                Buffer.from(hash),
                Buffer.from(signature, 'base64')
            );
        } catch (exception) {
            res.sendStatus(400);
            return;
        }
        const admin_users = admin_user_list.map(({username}) => username);
        const admin_user_keys = admin_user_list.map(({aes_key}) => Buffer.from(aes_key));
        const other_users = other_user_list.map(({username}) => username);
        const other_user_keys = other_user_list.map(({aes_key}) => Buffer.from(aes_key));
        const result = await databaseContract.createGroup(username, groupname, admin_users, admin_user_keys, other_users, other_user_keys, Date.now());
        res.json(result);
    }
});

app.post('/g/update/:groupId', async (req, res) => {
    const groupId = req.params.groupId.replace("_","/");
    const username = req.body.username;
    const groupname = req.body.group_name;
    const admin_user_list = req.body.admin_users;
    const other_user_list = req.body.other_users;
    const signature = req.body.signature;

    const hashString = username + JSON.stringify(admin_users) + groupname + JSON.stringify(other_users);
    let hash = await crypto.subtle.digest("SHA-256", Buffer.from(hashString));
    hash = Buffer.from(hash);
    const publicKey = await getPublicKey(username);
    if(publicKey == null) {
        res.sendStatus(404);
    } else {
        try {
            await verify(
                Buffer.from(Buffer.from(publicKey,'base64')),
                Buffer.from(hashMsg),
                Buffer.from(signature, 'base64')
            );
        } catch (exception) {
            res.sendStatus(400);
            return;
        }
        const admin_users = admin_user_list.map(({username}) => username);
        const admin_user_keys = admin_user_list.map(({aes_key}) => aes_key);
        const other_users = other_user_list.map(({username}) => username);
        const other_user_keys = other_user_list.map(({aes_key}) => aes_key);
        const result = await databaseContract.updateGroup(
            Buffer.from(groupId,'base64'),
            username,
            groupname,
            admin_users, admin_user_keys, other_users, other_user_keys);
        res.json(result);
    }
});

app.get('/g/i/:groupId', async (req,res) => {
    const groupId = Buffer.from(req.params.groupId.replace("_","/"), 'base64');
    const group = await databaseContract.getGroupInfo(groupId);
    res.send(group);
});

app.get('/g/k/:groupId/:version/:username', async (req,res) => {
    const groupId = Buffer.from(req.params.groupId.replace("_","/"), 'base64');
    const version = parseInt(req.params.version);
    const username = req.params.username;

    const aes_key = await databaseContract.getKeyforuserGroup(groupId, version, username);
    res.send(Buffer.from(aes_key.substring(2),'hex').toString('base64'));
});

app.get('/g/u/:userId', async (req,res) => {
    const userId = req.params.userId;
    const groupList = await databaseContract.getListofGroupsForUser(userId);
    const response = groupList.map((groupWithKey) => {
        return {
            id: Buffer.from(groupWithKey[0][0].substring(2), 'hex').toString('base64'),
            version: groupWithKey[0][1],
            name: groupWithKey[0][2],
            admin_users: groupWithKey[0][3],
            other_users: groupWithKey[0][4],
            key: Buffer.from(groupWithKey[1].substring(2), 'hex').toString('base64')
        };
    });
    res.send(response);
});

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
