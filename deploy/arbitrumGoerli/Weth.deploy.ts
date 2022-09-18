import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const wethToken = await deploy('MockWeth', {
        from: deployer,
        log: true,
    });

    const entries = [
        { name: 'WETH Address', value: wethToken.address },
    ];

    console.log(`---- TreasureMarketplace Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['weth'];
