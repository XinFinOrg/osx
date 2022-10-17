// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {PermissionLib} from "../../../core/permission/PermissionLib.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

address constant NO_ORACLE = address(0);

function mockPermissions(uint160 amount, PermissionLib.Operation op)
    pure
    returns (PermissionLib.ItemMultiTarget[] memory permissions)
{
    permissions = new PermissionLib.ItemMultiTarget[](amount);

    for (uint160 i = 0; i < amount; i++) {
        permissions[i] = PermissionLib.ItemMultiTarget(
            op,
            address(i),
            address(i),
            NO_ORACLE,
            keccak256("MOCK_PERMISSION")
        );
    }
}

function mockHelpers(uint160 amount) pure returns (address[] memory helpers) {
    helpers = new address[](amount);

    for (uint160 i = 0; i < amount; i++) {
        helpers[i] = address(i);
    }
}

function mockPluginProxy(address _pluginBase, address _dao) returns (address) {
    return
        payable(
            address(
                new ERC1967Proxy(
                    _pluginBase,
                    abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), _dao)
                )
            )
        );
}
