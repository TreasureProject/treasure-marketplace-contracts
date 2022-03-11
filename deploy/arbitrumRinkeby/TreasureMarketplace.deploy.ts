import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicToken = await deploy('ERC20Mintable', {
      from: deployer,
      log: true
    })

    const fee = 500; // 5%
    const feeReceipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const newOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const newProxyOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const nftApprovedList: any[] = [
      {
        name: "smol_brains",
        address: "0xFdA3f366B12eec68E187dbABDEC7bc5aEF49Bb31",
        status: 1,
      },
    ];

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      proxy: {
        owner: newProxyOwner,
        proxyContract: 'OpenZeppelinTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [fee, feeReceipient, magicToken.address]
          }
        }
      }
    })

    for (const nft of nftApprovedList) {
      if ((await read('TreasureMarketplace', 'tokenApprovals', nft.address)) == 0) {
        console.log('setting:', nft.name, nft.address);
        await execute(
          'TreasureMarketplace',
          { from: deployer, log: true },
          'setTokenApprovalStatus',
          nft.address,
          nft.status
        );
      }
    }

    const TREASURE_MARKETPLACE_ADMIN_ROLE = await read('TreasureMarketplace', 'TREASURE_MARKETPLACE_ADMIN_ROLE');

    if(!(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner))) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'grantRole',
        TREASURE_MARKETPLACE_ADMIN_ROLE,
        newOwner
      );
    }

    // if new owner is set, remove original owner
    if(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer)) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'renounceRole',
        TREASURE_MARKETPLACE_ADMIN_ROLE,
        deployer
      );
    }

    const DefaultProxyAdmin = await deployments.get('DefaultProxyAdmin');

    const entries = [
      { name: 'DefaultProxyAdmin.address', value: DefaultProxyAdmin.address },
      { name: 'DefaultProxyAdmin.getProxyAdmin("TreasureMarketplace")', value: await read('DefaultProxyAdmin', 'getProxyAdmin', treasureMarketplace.address) },
      { name: 'DefaultProxyAdmin.owner()', value: await read('DefaultProxyAdmin', 'owner') },
      { name: `TreasureMarketplace.hasRole(${newOwner})`, value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner) },
      { name: `TreasureMarketplace.hasRole(${deployer})`, value: await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, deployer) },
      { name: `TreasureMarketplace.feeReceipient()`, value: await read('TreasureMarketplace', 'feeReceipient') },
      { name: `TreasureMarketplace.fee()`, value: (await read('TreasureMarketplace', 'fee')).toNumber() },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['marketplace'];
