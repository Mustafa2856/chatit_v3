pragma solidity ^0.8.17;

contract Database {
    // Structs to represent each table in the schema
    struct UserInfo {
        string username;
        bytes private_key;
        bytes public_key;
    }

    // Mapping to store the data in each table
    mapping(string => UserInfo) public userinfo;

    // Functions to add and remove data from the tables
    function addUserInfo(string memory _username, bytes memory _private_key, bytes memory _public_key) public {
        userinfo[_username] = UserInfo(_username, _private_key, _public_key);
    }

    function getUserInfo(string memory _username) view public returns (UserInfo memory){
        return userinfo[_username];
    }
}
