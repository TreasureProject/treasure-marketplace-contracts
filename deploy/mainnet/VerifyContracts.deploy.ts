import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const isUnitTests = hre.network.name === "hardhat";

    if (isUnitTests) {
        return;
    }

    try {
        switch (hre.network.name) {
            case 'arbitrumSepolia':
                await hre.run('etherscan-verify', {
                    apiUrl: 'https://api-sepolia.arbiscan.io',
                    apiKey: process.env.ARBISCAN_API_KEY,
                    sleep: true,
                });
                break;
            default:
                await hre.run('etherscan-verify', {
                    apiKey: process.env.ETHERSCAN_API_KEY,
                    sleep: true,
                });
                break;
        }
    } catch (error) {
        console.log(`Error verifying: ${error}`);
    }
    
};
export default func;
func.tags = ['VerifyContracts'];
func.dependencies = [];
func.runAtTheEnd = true;
