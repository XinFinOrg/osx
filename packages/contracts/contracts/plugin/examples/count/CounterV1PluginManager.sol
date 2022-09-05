// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {Permission, PluginManager, PluginManagerLib} from "../../PluginManager.sol";
import {MultiplyHelper} from "./MultiplyHelper.sol";
import {CounterV1} from "./CounterV1.sol";

contract CounterV1PluginManager is PluginManager {
    using Clones for address;
    using PluginManagerLib for PluginManagerLib.Data;

    // For testing purposes, the below are public...
    MultiplyHelper public multiplyHelperBase;
    CounterV1 public counterBase;

    address private constant NO_ORACLE = address(0);

    constructor() {
        multiplyHelperBase = new MultiplyHelper();
        counterBase = new CounterV1();
    }

    function _getInstallInstruction(PluginManagerLib.Data memory installation)
        internal
        view
        override
        returns (PluginManagerLib.Data memory)
    {
        // Decode the parameters from the UI
        (address _multiplyHelper, uint256 _num) = abi.decode(
            installation.params,
            (address, uint256)
        );

        address multiplyHelper = _multiplyHelper;

        if (_multiplyHelper == address(0)) {
            multiplyHelper = installation.addHelper(address(multiplyHelperBase), bytes(""));
        }

        bytes memory initData = abi.encodeWithSelector(
            bytes4(keccak256("initialize(address,uint256)")),
            multiplyHelper,
            _num
        );

        installation.plugins = new PluginManagerLib.Deployment[](2);
        
        address pluginAddr = installation.addPlugin(address(counterBase), initData);

        installation.addPermission(
            Permission.Operation.Grant,
            installation.dao,
            pluginAddr,
            NO_ORACLE,
            keccak256("EXEC_PERMISSION")
        );

        installation.addPermission(
            Permission.Operation.Grant,
            pluginAddr,
            installation.dao,
            NO_ORACLE,
            counterBase.MULTIPLY_PERMISSION_ID()
        );

        if (_multiplyHelper == address(0)) {
            installation.addPermission(
                Permission.Operation.Grant,
                multiplyHelper,
                pluginAddr,
                NO_ORACLE,
                multiplyHelperBase.MULTIPLY_PERMISSION_ID()
            );
        }
        return installation;
    }

    function getImplementationAddress() public view virtual override returns (address) {
        return address(counterBase);
    }

    function deployABI() external view virtual override returns (string memory) {
        return "(address multiplyHelper, uint num)";
    }
}
