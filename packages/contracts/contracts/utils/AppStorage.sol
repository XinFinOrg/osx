// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./UnstructuredStorage.sol";
import "../core/IDAO.sol";

/// @notice Core storage that stores information at very specific slots.
contract AppStorage {
    using UnstructuredStorage for bytes32;
    
    /* Hardcoded constants to save gas
    bytes32 internal constant DAO_POSITION = keccak256("core.storage.dao");
    */
    bytes32 internal constant DAO_POSITION = 0xd69e81f6042b963e91c7595979ec7bb19d41b99e5a44a91c85e5cd5861e49998;
    
    /// @notice Gets the dao(DAO.sol contract) address which is set at DAO_POSITION slot.
    /// @return IDAO address of the DAO
    function dao() public view returns (IDAO) {
        return IDAO(DAO_POSITION.getStorageAddress());
    }

    /// @notice Sets the dao(DAO.sol contract) address at DAO_POSITION slot.
    function setDAO(address _dao) internal {
        DAO_POSITION.setStorageAddress(_dao);
    }

}