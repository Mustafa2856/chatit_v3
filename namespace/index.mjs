import express from 'express';
import bodyParser from 'body-parser';
import { databaseContract } from './chain.mjs';
import { verify } from 'eccrypto';

const app = express();
app.use(bodyParser.json());
const port = 3000;

app.get('/:userId', async (req, res) => {
    const userDetails = await databaseContract.getUserInfo(req.params.userId);
    // user does not exist
    if (userDetails[0] == "") {
        res.json({});
    }
    else {
        res.json(userDetails);
    }
});

app.post('/:userId', async (req, res) => {

    const userId = req.params.userId;
    const privateKey = req.body.private_key;
    const publicKey = req.body.public_key;

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