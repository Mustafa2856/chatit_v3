import { ethers } from "ethers";
import ganache from "ganache";
import Database from './build/contracts/Database.json' assert {type: "json"};

const PRIVATE_KEY = "0x5b3208286264f409e1873e3709d3138acf47f6cc733e74a6b47a040b50472fd8";
const CONTRACT_ADDRESS = "0x50e7d57bb32fe6b98783591d113722988a7ad5c8";

const provider = new ethers.providers.Web3Provider(ganache.provider({
    database: {
        dbPath: 'chainData'
    },
    wallet: {
        seed: 'myCustomSeed'
    }
}));
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

export const databaseContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    Database.abi,
    signer
);
