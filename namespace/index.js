import express from 'express';
import bodyParser from 'body-parser';
import { databaseContract } from './chain.js';
const app = express();
app.use(bodyParser.json());
const port = 3000;

app.get('/:userId', async (req, res) => {
    const userDetails = await databaseContract.userinfo('user1');
    res.json(userDetails);
    
});

app.post('/:userId', async (req, res) => {
    
    const result = await databaseContract.addUserInfo(
        req.params.userId,
        req.body.private_key,
        req.body.public_key
    );
    res.json(result);
});

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});