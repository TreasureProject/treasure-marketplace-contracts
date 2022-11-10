import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read } = deployments;
    const { deployer } = await getNamedAccounts();

    const badges = await deploy('TroveBadges', {
        from: deployer,
        log: true,
        proxy: {
            owner: deployer,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [],
                },
            },
        },
    });

    // ipfs://QmUokgu8K4McQAmFVrSocaXBnmy5naTUKNes1hartTJiRs/ is the IPFS of Smol Racing Trophies for testnet only
    const badgesUri = 'ipfs://QmUokgu8K4McQAmFVrSocaXBnmy5naTUKNes1hartTJiRs/';
    await execute('TroveBadges', { from: deployer, log: true },
        'setUri',
        
    );
};
export default func;
func.tags = ['TroveBadges'];
