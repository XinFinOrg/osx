import {expect} from 'chai';
import {ethers} from 'hardhat';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

import {
  DAO as DAO_V1_0_0,
  DAO__factory as DAO_V1_0_0__factory,
} from '../../typechain/osx-versions/v1_0_0/contracts/core/dao/DAO.sol';
import {
  DAO as DAO_V1_2_0,
  DAO__factory as DAO_V1_2_0__factory,
} from '../../typechain/osx-versions/v1_2_0/contracts/core/dao/DAO.sol';
import {DAO, DAO__factory} from '../../typechain';

import {daoExampleURI, ZERO_BYTES32} from '../test-utils/dao';
import {deployWithProxy} from '../test-utils/proxy';
import {UPGRADE_PERMISSIONS} from '../test-utils/permissions';
import {findEventTopicLog} from '../../utils/event';
import {readImplementationValueFromSlot} from '../../utils/storage';

let signers: SignerWithAddress[];
let DAO_V1_0_0: DAO_V1_0_0__factory;
let DAO_V1_2_0: DAO_V1_2_0__factory;
let DAO_Current: DAO__factory;

let daoV100Proxy: DAO_V1_0_0;
let daoV120Proxy: DAO_V1_2_0;

let daoV100Implementation: string;
let daoV120Implementation: string;
let daoCurrentImplementaion: DAO;

const EMPTY_DATA = '0x';

const DUMMY_METADATA = ethers.utils.hexlify(
  ethers.utils.toUtf8Bytes('0x123456789')
);

const FORWARDER_1 = `0x${'1'.repeat(40)}`;
const FORWARDER_2 = `0x${'2'.repeat(40)}`;

describe('DAO Upgrade', function () {
  before(async function () {
    signers = await ethers.getSigners();

    // We don't use the typchain here but directly grab the artifacts. This will be changed in an upcoming PR again.
    DAO_V1_0_0 = new DAO_V1_0_0__factory(signers[0]);
    DAO_V1_2_0 = new DAO_V1_2_0__factory(signers[0]);
    DAO_Current = new DAO__factory(signers[0]);

    // Deploy the v1.3.0 implementation
    daoCurrentImplementaion = await DAO_Current.deploy();
  });

  context(`v1.0.0 to v1.3.0`, function () {
    beforeEach(async function () {
      daoV100Proxy = await deployWithProxy<DAO_V1_0_0>(DAO_V1_0_0);
      await daoV100Proxy.initialize(
        DUMMY_METADATA,
        signers[0].address,
        ethers.constants.AddressZero,
        daoExampleURI
      );

      // Store the v1.0.0 implementation
      daoV100Implementation = await readImplementationValueFromSlot(
        daoV100Proxy.address
      );

      // Grant the upgrade permission
      await daoV100Proxy.grant(
        daoV100Proxy.address,
        signers[0].address,
        UPGRADE_PERMISSIONS.UPGRADE_DAO_PERMISSION_ID
      );
    });

    it('does not corrupt the DAO storage', async () => {
      // Upgrade and call `initializeFrom`.
      const upgradeTx = await daoV100Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 0, 0],
          EMPTY_DATA,
        ])
      );

      // Check the stored implementation.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV100Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV100Implementation);

      // Check the emitted implementation.
      const emittedImplementation = (
        await findEventTopicLog(upgradeTx, DAO_V1_0_0.interface, 'Upgraded')
      ).args.implementation;
      expect(emittedImplementation).to.equal(daoCurrentImplementaion.address);

      // Check that storage is not corrupted.
      expect(await daoV100Proxy.callStatic.daoURI()).to.equal(daoExampleURI);
    });

    it('does not corrupt permissions', async () => {
      await daoV100Proxy.grant(
        daoV100Proxy.address,
        signers[0].address,
        ethers.utils.id('EXECUTE_PERMISSION')
      );

      // Check that permissions are granted before the upgrade
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('EXECUTE_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('ROOT_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;

      // Check that a arbitrary permission is not granted.
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('NOT_GRANTED'),
          EMPTY_DATA
        )
      ).to.be.false;

      // Upgrade and call `initializeFrom`.
      await daoV100Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 0, 0],
          EMPTY_DATA,
        ])
      );

      // Check the stored implementation.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV100Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV100Implementation);

      // Check that the permissions are still granted.
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('EXECUTE_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('ROOT_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;

      // Check that a the arbitrary permission is still not granted.
      expect(
        await daoV100Proxy.hasPermission(
          daoV100Proxy.address,
          signers[0].address,
          ethers.utils.id('NOT_GRANTED'),
          EMPTY_DATA
        )
      ).to.be.false;
    });

    it('executes actions after the upgrade', async () => {
      await daoV100Proxy.grant(
        daoV100Proxy.address,
        signers[0].address,
        ethers.utils.id('EXECUTE_PERMISSION')
      );

      // We use the `setTrustedForwarder` to test execution and must give permission to the DAO (executor) to call it.
      await daoV100Proxy.grant(
        daoV100Proxy.address,
        daoV100Proxy.address,
        ethers.utils.id('SET_TRUSTED_FORWARDER_PERMISSION')
      );

      // Create an action to set forwarder1
      const forwarderChangeAction1 = {
        to: daoV100Proxy.address,
        data: daoV100Proxy.interface.encodeFunctionData('setTrustedForwarder', [
          FORWARDER_1,
        ]),
        value: 0,
      };

      // Execute and check in the event that the forwarder1 has been set.
      await expect(
        daoV100Proxy.execute(ZERO_BYTES32, [forwarderChangeAction1], 0)
      )
        .to.emit(daoV100Proxy, 'TrustedForwarderSet')
        .withArgs(FORWARDER_1);

      // Check that the storage variable now forwarder 1.
      expect(await daoV100Proxy.getTrustedForwarder()).to.equal(FORWARDER_1);

      // Upgrade and call `initializeFrom`.
      await daoV100Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 0, 0],
          EMPTY_DATA,
        ])
      );

      // Check that the stored implementatio has changed.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV100Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV100Implementation);

      // Check that the old forwarder is still unchanged.
      expect(await daoV100Proxy.getTrustedForwarder()).to.equal(FORWARDER_1);

      // Create an action to change the forwarder to a new address.
      const testAction = {
        to: daoV100Proxy.address,
        data: daoV100Proxy.interface.encodeFunctionData('setTrustedForwarder', [
          FORWARDER_2,
        ]),
        value: 0,
      };

      // Execute and check in the event that the forwarder1 has been set.
      await expect(daoV100Proxy.execute(ZERO_BYTES32, [testAction], 0))
        .to.emit(daoV100Proxy, 'TrustedForwarderSet')
        .withArgs(FORWARDER_2);

      // Check that the storage variable is now forwarder 2.
      expect(await daoV100Proxy.getTrustedForwarder()).to.equal(FORWARDER_2);
    });
  });

  context(`v1.2.0 to v1.3.0`, function () {
    beforeEach(async function () {
      daoV120Proxy = await deployWithProxy(DAO_V1_2_0);
      await daoV120Proxy.initialize(
        DUMMY_METADATA,
        signers[0].address,
        ethers.constants.AddressZero,
        daoExampleURI
      );

      // Store the v1.2.0 implementation
      daoV120Implementation = await readImplementationValueFromSlot(
        daoV120Proxy.address
      );

      // Grant the upgrade permission
      await daoV120Proxy.grant(
        daoV120Proxy.address,
        signers[0].address,
        UPGRADE_PERMISSIONS.UPGRADE_DAO_PERMISSION_ID
      );
    });

    it('does not corrupt the DAO storage', async () => {
      // Upgrade and call `initializeFrom`.
      const upgradeTx = await daoV120Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 2, 0],
          EMPTY_DATA,
        ])
      );

      // Check the stored implementation.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV120Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV120Implementation);

      // Check the emitted implementation.
      const emittedImplementation = (
        await findEventTopicLog(upgradeTx, DAO_V1_2_0.interface, 'Upgraded')
      ).args.implementation;
      expect(emittedImplementation).to.equal(daoCurrentImplementaion.address);

      // Check that storage is not corrupted.
      expect(await daoV120Proxy.callStatic.daoURI()).to.equal(daoExampleURI);
    });

    it('does not corrupt permissions', async () => {
      await daoV120Proxy.grant(
        daoV120Proxy.address,
        signers[0].address,
        ethers.utils.id('EXECUTE_PERMISSION')
      );

      // Check that permissions are granted before the upgrade
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('EXECUTE_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('ROOT_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;

      // Check that a arbitrary permission is not granted.
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('NOT_GRANTED'),
          EMPTY_DATA
        )
      ).to.be.false;

      // Upgrade and call `initializeFrom`.
      await daoV120Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 2, 0],
          EMPTY_DATA,
        ])
      );

      // Check the stored implementation.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV120Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV120Implementation);

      // Check that the permissions are still granted.
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('EXECUTE_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('ROOT_PERMISSION'),
          EMPTY_DATA
        )
      ).to.be.true;

      // Check that a the arbitrary permission is still not granted.
      expect(
        await daoV120Proxy.hasPermission(
          daoV120Proxy.address,
          signers[0].address,
          ethers.utils.id('NOT_GRANTED'),
          EMPTY_DATA
        )
      ).to.be.false;
    });

    it('executes actions after the upgrade', async () => {
      await daoV120Proxy.grant(
        daoV120Proxy.address,
        signers[0].address,
        ethers.utils.id('EXECUTE_PERMISSION')
      );

      // We use the `setTrustedForwarder` to test execution and must give permission to the DAO (executor) to call it.
      await daoV120Proxy.grant(
        daoV120Proxy.address,
        daoV120Proxy.address,
        ethers.utils.id('SET_TRUSTED_FORWARDER_PERMISSION')
      );

      // Create an action to set forwarder1
      const forwarderChangeAction1 = {
        to: daoV120Proxy.address,
        data: daoV120Proxy.interface.encodeFunctionData('setTrustedForwarder', [
          FORWARDER_1,
        ]),
        value: 0,
      };

      // Execute and check in the event that the forwarder1 has been set.
      await expect(
        daoV120Proxy.execute(ZERO_BYTES32, [forwarderChangeAction1], 0)
      )
        .to.emit(daoV120Proxy, 'TrustedForwarderSet')
        .withArgs(FORWARDER_1);

      // Check that the storage variable now forwarder 1.
      expect(await daoV120Proxy.getTrustedForwarder()).to.equal(FORWARDER_1);

      // Upgrade and call `initializeFrom`.
      await daoV120Proxy.upgradeToAndCall(
        daoCurrentImplementaion.address,
        DAO_Current.interface.encodeFunctionData('initializeFrom', [
          [1, 2, 0],
          EMPTY_DATA,
        ])
      );

      // Check that the stored implementatio has changed.
      const implementationAfterUpgrade = await readImplementationValueFromSlot(
        daoV120Proxy.address
      );
      expect(implementationAfterUpgrade).to.equal(
        daoCurrentImplementaion.address
      );
      expect(implementationAfterUpgrade).to.not.equal(daoV100Implementation);

      // Check that the old forwarder is still unchanged.
      expect(await daoV120Proxy.getTrustedForwarder()).to.equal(FORWARDER_1);

      // Create an action to change the forwarder to a new address.
      const testAction = {
        to: daoV120Proxy.address,
        data: daoV120Proxy.interface.encodeFunctionData('setTrustedForwarder', [
          FORWARDER_2,
        ]),
        value: 0,
      };

      // Execute and check in the event that the forwarder1 has been set.
      await expect(daoV120Proxy.execute(ZERO_BYTES32, [testAction], 0))
        .to.emit(daoV120Proxy, 'TrustedForwarderSet')
        .withArgs(FORWARDER_2);

      // Check that the storage variable is now forwarder 2.
      expect(await daoV120Proxy.getTrustedForwarder()).to.equal(FORWARDER_2);
    });
  });
});