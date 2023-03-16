//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Database {
    struct UserInfo {
        string username;
        bytes private_key;
        bytes public_key;
    }

    struct Group {
        bytes32 id;
        uint32 version;
        string name;
        string[] admin_users;
        string[] other_users;
    }

    struct GroupWithKey {
        Group group;
        bytes key;
    }

    mapping(string => UserInfo) internal userinfo;
    mapping(string => bytes32[]) internal group_membership;
    mapping(bytes32 => Group) internal groups;
    mapping(bytes32 => bytes) internal userGroupKeys;

    function addUserInfo(
        string memory _username,
        bytes memory _private_key,
        bytes memory _public_key
    ) public {
        require(
            keccak256(abi.encodePacked(userinfo[_username].username)) ==
                keccak256(abi.encodePacked(""))
        );
        userinfo[_username] = UserInfo(_username, _private_key, _public_key);
    }

    function updateUserInfo(
        string memory _username,
        bytes memory _private_key,
        bytes memory _public_key
    ) public {
        require(
            keccak256(abi.encodePacked(userinfo[_username].username)) !=
                keccak256(abi.encodePacked(""))
        );
        userinfo[_username] = UserInfo(_username, _private_key, _public_key);
    }

    function getUserInfo(
        string memory _username
    ) public view returns (UserInfo memory) {
        return userinfo[_username];
    }

    function createGroup(
        string memory _username,
        string memory _groupname,
        string[] memory _admin_users,
        bytes[] memory _admin_user_keys,
        string[] memory _other_users,
        bytes[] memory _other_user_keys,
        uint64 _timestamp
    ) public returns (bytes32){
        require(
            _admin_users.length == _admin_user_keys.length,
            "Number of keys differs from number of users in Admin Role"
        );
        require(
            _other_users.length == _other_user_keys.length,
            "Number of keys differs from number of users in Other Role"
        );

        bytes32 id = keccak256(
            abi.encodePacked(_groupname, _username, _timestamp)
        );
        groups[id] = Group(id, 0, _groupname, _admin_users, _other_users);

        for (uint i = 0; i < _admin_users.length; i++) {
            group_membership[_admin_users[i]].push(id);
            addKeyforUserGroup(id, 0, _admin_users[i], _admin_user_keys[i]);
        }

        for (uint i = 0; i < _other_users.length; i++) {
            group_membership[_other_users[i]].push(id);
            addKeyforUserGroup(id, 0, _other_users[i], _other_user_keys[i]);
        }

        return id;
    }

    function updateGroup(
        bytes32 groupid,
        string memory _username,
        string memory _groupname,
        string[] memory _admin_users,
        bytes[] memory _admin_user_keys,
        string[] memory _other_users,
        bytes[] memory _other_user_keys
    ) public {
        require(groups[groupid].id == groupid, "Group Does not already exist");
        require(
            _admin_users.length == _admin_user_keys.length,
            "Number of keys differs from number of users in Admin Role"
        );
        require(
            _other_users.length == _other_user_keys.length,
            "Number of keys differs from number of users in Other Role"
        );

        Group memory old_group = groups[groupid];
        uint32 version = old_group.version + 1;
        bytes32 username_hash = keccak256(abi.encodePacked(_username));
        bool flag = false;

        for (uint i = 0; i < old_group.admin_users.length; i++) {
            flag = flag || (keccak256(abi.encodePacked(old_group.admin_users[i])) == username_hash);
        }

        require(flag, "User should be an Admin user to be able to update group details");
        
        groups[groupid] = Group(
            groupid,
            version,
            _groupname,
            _admin_users,
            _other_users
        );

        for (uint i = 0; i < _admin_users.length; i++) {
            addKeyforUserGroup(
                groupid,
                version,
                _admin_users[i],
                _admin_user_keys[i]
            );
        }

        for (uint i = 0; i < _other_users.length; i++) {
            addKeyforUserGroup(
                groupid,
                version,
                _other_users[i],
                _other_user_keys[i]
            );
        }
    }

    function getGroupInfo(bytes32 _id) public view returns (Group memory) {
        return groups[_id];
    }

    function addKeyforUserGroup(
        bytes32 _groupid,
        uint _group_version,
        string memory _username,
        bytes memory key
    ) public {
        userGroupKeys[
            keccak256(abi.encodePacked(_groupid, _group_version, _username))
        ] = key;
    }

    function getKeyforuserGroup(
        bytes32 _groupid,
        uint _group_version,
        string memory _username
    ) public view returns (bytes memory) {
        return
            userGroupKeys[
                keccak256(abi.encodePacked(_groupid, _group_version, _username))
            ];
    }

    function getListofGroupsForUser(
        string memory _username
    ) public view returns (GroupWithKey[] memory) {
        bytes32[] memory group_ids = group_membership[_username];
        GroupWithKey[] memory group_list = new GroupWithKey[](group_ids.length);
        for (uint i = 0; i < group_ids.length; i++) {
            group_list[i].group = getGroupInfo(group_ids[i]);
            group_list[i].key = getKeyforuserGroup(
                group_list[i].group.id,
                group_list[i].group.version,
                _username
            );
        }
        return group_list;
    }
}
