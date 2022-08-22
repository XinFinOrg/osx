// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import { Permission, PluginManager } from "../../PluginManager.sol";
import { MultiplyHelper } from "./MultiplyHelper.sol";
import { CounterV1 } from "./CounterV1.sol";

contract CounterV1PluginManager is PluginManager {
    
    MultiplyHelper private multiplyHelperBase;
    CounterV1 private counterBase;

    address private constant NO_ORACLE = address(0);

    constructor() {
        multiplyHelperBase = new MultiplyHelper();
        counterBase = new CounterV1();
    }

    function deploy(address dao, bytes memory data)
        external
        virtual
        override
        returns (address plugin, Permission.ItemMultiTarget[] memory permissions)
    {
        // Decode the parameters from the UI
        (address _multiplyHelper, uint256 _num) = abi.decode(data, (address, uint256));

        // Allocate space for requested permission that will be applied on this plugin installation.
        permissions = new Permission.ItemMultiTarget[](_multiplyHelper == address(0) ? 2 : 3);

        if (_multiplyHelper == address(0)) {
            // Deploy some internal helper contract for the Plugin
            _multiplyHelper = createProxy(dao, address(multiplyHelperBase), "0x");
        }

        // Encode the parameters that will be passed to initialize() on the Plugin
        bytes memory initData = abi.encodeWithSelector(
            bytes4(keccak256("function initialize(address,uint256))")),
            _multiplyHelper,
            _num
        );
        
        // Deploy the Plugin itself, make it point to the implementation and
        // pass it the initialization params
        plugin = createProxy(dao, getImplementationAddress(), initData);
        
        // Allows plugin Count to call execute on DAO
        permissions[0] = Permission.ItemMultiTarget(
            Permission.Operation.Grant,
            dao,
            plugin,
            NO_ORACLE,
            keccak256("EXEC_PERMISSION")
        );

        // Allows DAO to call Multiply on plugin Count
        permissions[1] = Permission.ItemMultiTarget(
            Permission.Operation.Grant,
            plugin,
            dao,
            NO_ORACLE,
            counterBase.MULTIPLY_PERMISSION_ID()
        );

        // MultiplyHelper could be something that dev already has it from outside
        // which mightn't be a aragon plugin. It's dev's responsibility to do checks
        // and risk whether or not to still set the permission.
        if (_multiplyHelper == address(0)) {
            // Allows Count plugin to call MultiplyHelper's multiply function.
            permissions[2] = Permission.ItemMultiTarget(
                Permission.Operation.Grant,
                _multiplyHelper,
                plugin,
                NO_ORACLE,
                multiplyHelperBase.MULTIPLY_PERMISSION_ID()
            );
        }
    }

    function getImplementationAddress() public view virtual override returns (address) {
        return address(counterBase);
    }

    function deployABI() external view virtual override returns (string memory) {
        return "(address multiplyHelper, uint num)";
    }
}
