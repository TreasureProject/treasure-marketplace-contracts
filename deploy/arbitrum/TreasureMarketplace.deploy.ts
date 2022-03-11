import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicArbitrum = "0x539bdE0d7Dbd336b79148AA742883198BBF60342";
    const fee = 500; // 5%
    const feeRecipient = "0xDb6Ab450178bAbCf0e467c1F3B436050d907E233";
    const newOwner = feeRecipient;
    const newProxyOwner = feeRecipient;
    const nftApprovedList = [
      // treasure
      {
        address: "0xEBba467eCB6b21239178033189CeAE27CA12EaDf",
        status: 2
      },
      // seedOfLife
      {
        address: "0x3956C81A51FeAed98d7A678d53F44b9166c8ed66",
        status: 2
      },
      // legions
      {
        address: "0x658365026D06F00965B5bb570727100E821e6508",
        status: 2
      },
      // legionsGenesis
      {
        address: "0xE83c0200E93Cb1496054e387BDdaE590C07f0194",
        status: 2
      },
      // keys
      {
        address: "0xf0a35bA261ECE4FC12870e5B7b9E7790202EF9B5",
        status: 2
      },
      // extraLife
      {
        address: "0x21e1969884D477afD2Afd4Ad668864a0EebD644c",
        status: 2
      },
    ]

    const treasureMarketplace = await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      proxy: {
        owner: newProxyOwner,
        execute: {
          init: {
            methodName: "initialize",
            args: [fee, feeRecipient, magicArbitrum]
          }
        }
      }
    })

    for (const nft of nftApprovedList) {
      if ((await read('TreasureMarketplace', 'tokenApprovals', nft.address)) == 0) {
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
    // if(await read('TreasureMarketplace', 'hasRole', TREASURE_MARKETPLACE_ADMIN_ROLE, newOwner)) {
    //   await execute(
    //     'TreasureMarketplace',
    //     { from: deployer, log: true },
    //     'renounceRole',
    //     TREASURE_MARKETPLACE_ADMIN_ROLE,
    //     deployer
    //   );
    // }
};
export default func;
func.tags = ['marketplace'];
