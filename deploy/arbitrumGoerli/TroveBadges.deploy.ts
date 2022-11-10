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

    await execute('TroveBadges', { from: deployer, log: true },
        'setUri',
        [ 'ipfs://QmUokgu8K4McQAmFVrSocaXBnmy5naTUKNes1hartTJiRs/' ]
    );
};
export default func;
func.tags = ['TroveBadges'];
