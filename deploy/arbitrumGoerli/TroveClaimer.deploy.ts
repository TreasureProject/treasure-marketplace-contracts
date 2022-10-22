import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { DeployHelper } from '../DeployHelper';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute, read, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const badges = await get('TroveBadges');

    // Wallet address stored on Trove AWS: 0xC0DE123d0CA961A3EA9D2D29E015ce74d3EC124f
    let validator = "0xC0DE123d0CA961A3EA9D2D29E015ce74d3EC124f";

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

    await DeployHelper.setRoleIfNeeded(hre, 'TroveBadges', 'ADMIN', claimer.address);

    if(await read('TroveClaimer', 'paused')) {
        await execute('TroveClaimer',
            {
                from: deployer,
                log: true,
            },
            'setPause', false
        );
    }

    if(!(await read('TroveClaimer', 'badgeToEnabledStatus', badges.address, 1))) {
        await execute('TroveClaimer',
            {
                from: deployer,
                log: true,
            },
            'setBadgeStatus', badges.address, 1, true
        );
    }


};
export default func;
func.tags = ['TroveClaimer'];
func.dependencies = ['TroveBadges'];
