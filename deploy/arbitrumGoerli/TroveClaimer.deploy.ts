import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const badges = await get('TroveBadges');

    // validator will be the AWS secured signer address for production
    let validator = deployer;

    const claimer = await deploy('TroveClaimer', {
        from: deployer,
        log: true,
        proxy: {
            owner: deployer,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [validator, badges.address],
                },
            },
        },
    });

    const entries = [
        { name: 'TroveClaimer Address', value: claimer.address },
        { name: 'TroveClaimerImpl Address', value: claimer.implementation },
    ];

    console.log(`---- TroveClaimer Config ----`);
    console.table(entries);
};
export default func;
func.tags = ['TroveClaimer'];
func.dependencies = ['TroveBadges'];
