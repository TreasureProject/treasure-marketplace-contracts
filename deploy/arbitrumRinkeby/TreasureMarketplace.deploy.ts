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
    const feeRecipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const newOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const newProxyOwner = "0xB013ABD83F0bD173E9F14ce7d6e420Ad711483b4";
    const nftApprovedList: any[] = [];

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      proxy: {
        owner: newProxyOwner,
        execute: {
          init: {
            methodName: "initialize",
            args: [fee, feeRecipient, magicToken.address]
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
    if(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner)) {
      await execute(
        'TreasureMarketplace',
        { from: deployer, log: true },
        'renounceRole',
        TREASURE_MARKETPLACE_ADMIN_ROLE,
        deployer
      );
    }
};
export default func;
func.tags = ['marketplace'];
