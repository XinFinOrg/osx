import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {Contract} from 'ethers';
import {defaultAbiCoder} from 'ethers/lib/utils';
import {ethers} from 'hardhat';
import {PluginUUPSUpgradeableV1Mock__factory} from '../../typechain';

// See https://eips.ethereum.org/EIPS/eip-1967
export const IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'; // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)

/// Used as a common test suite to test upgradeability of the contracts.
/// Presumes that `upgrade` object is set on `this` inside the actual test file.
/// this.upgrade consists of:
///     contract - address of the contract on which it tests if `upgradeTo` works as intended.
///     dao - dao contact that the contract belongs to.
///     user - ethers user object. Presumed that it doesn't have permission to call `upgradeTo`.
export function shouldUpgradeCorrectly(
  upgradePermissionId: string,
  upgradeRevertPermissionMessage: string
) {
  let uupsCompatibleBase: string;

  function DaoUnauthorizedRevertArgs(
    contract: Contract,
    user: SignerWithAddress,
    dao: Contract
  ) {
    return [dao.address, contract.address, user.address, upgradePermissionId];
  }

  function UnauthorizedRevertArgs(dao: Contract, user: SignerWithAddress) {
    return [dao.address, user.address, upgradePermissionId];
  }

  describe('UUPS Upgradeability Test', async () => {
    before(async () => {
      const signers = await ethers.getSigners();
      const factory = new PluginUUPSUpgradeableV1Mock__factory(signers[0]);
      uupsCompatibleBase = (await factory.deploy()).address;
    });

    it('reverts if user without permission tries to upgrade', async function () {
      const {user, contract, dao} = this.upgrade;
      const connect = contract.connect(user);
      const tx1 = connect.upgradeTo(ethers.constants.AddressZero);
      const tx2 = connect.upgradeToAndCall(ethers.constants.AddressZero, '0x');
      if (upgradeRevertPermissionMessage === 'DaoUnauthorized') {
        await expect(tx1)
          .to.be.revertedWithCustomError(
            contract,
            upgradeRevertPermissionMessage
          )
          .withArgs(...DaoUnauthorizedRevertArgs(contract, user, dao));
        await expect(tx2)
          .to.be.revertedWithCustomError(
            contract,
            upgradeRevertPermissionMessage
          )
          .withArgs(...DaoUnauthorizedRevertArgs(contract, user, dao));
      } else {
        await expect(tx1)
          .to.be.revertedWithCustomError(
            contract,
            upgradeRevertPermissionMessage
          )
          .withArgs(...UnauthorizedRevertArgs(dao, user));
        await expect(tx2)
          .to.be.revertedWithCustomError(
            contract,
            upgradeRevertPermissionMessage
          )
          .withArgs(...UnauthorizedRevertArgs(dao, user));
      }
    });

    it('updates correctly to new implementation', async function () {
      const {user, contract, dao} = this.upgrade;
      await dao.grant(contract.address, user.address, upgradePermissionId);
      const connect = contract.connect(user);

      // Check the event.
      await expect(connect.upgradeTo(uupsCompatibleBase))
        .to.emit(contract, 'Upgraded')
        .withArgs(uupsCompatibleBase);

      // Check the storage slot.
      const encoded = await ethers.provider.getStorageAt(
        contract.address,
        IMPLEMENTATION_SLOT
      );
      const implementation = defaultAbiCoder.decode(['address'], encoded)[0];
      expect(implementation).to.equal(uupsCompatibleBase);
    });
  });
}
