import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const magicToken = await deploy('ERC20Mintable', {
      from: deployer,
      log: true
    })

    const fee = 500; // 5%
    const feeRecipient = deployer;
    const oracle = (await deployments.get("TreasureNFTOracle")).address;
    const paymentToken = magicToken.address;

    await deploy('TreasureMarketplace', {
      from: deployer,
      log: true,
      args: [fee, feeRecipient, oracle, paymentToken]
    })
};
export default func;
func.tags = ['marketplace'];
func.dependencies = ['oracle']
