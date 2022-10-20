import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const placeholderToken = await deploy('PlaceholderToken', {
        from: deployer,
        log: true,
    });

    console.log(`---- PlaceholderToken Config ----`);
    const entries = [
        { name: 'PlaceholderToken address', value: placeholderToken.address },
    ];
    console.table(entries);
};
export default func;
func.tags = ['placeholder-token'];
