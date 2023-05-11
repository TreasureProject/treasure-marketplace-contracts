import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const isUnitTests = hre.network.name === "hardhat";

    if (isUnitTests) {
        return;
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
        throw new Error(`ETHERSCAN_API_KEY was undefined`);
    }

    try {
        switch (hre.network.name) {
            case 'sepolia':
                await hre.run("etherscan-verify", {apiKey, apiUrl: 'https://api-sepolia.etherscan.io', sleep: true});
                break;
            default:
                await hre.run("etherscan-verify");
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
