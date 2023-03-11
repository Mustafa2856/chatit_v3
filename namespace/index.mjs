import express from 'express';
import bodyParser from 'body-parser';
import { databaseContract } from './chain.mjs';
import { verify } from 'eccrypto';
import cors from 'cors';

const app = express();
app.use(bodyParser.json());
app.use(cors());
const port = 3000;

app.get('/:userId', async (req, res) => {
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

app.post('/:userId', async (req, res) => {

    const userId = req.params.userId;
    const privateKey = Buffer.from(req.body.private_key,'base64');
    const publicKey = Buffer.from(req.body.public_key,'base64');

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
                Buffer.from(userDetails[2]),
                Buffer.from(hashMsg),
                Buffer.from(signature)
            );
        } catch(exception) {
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

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
