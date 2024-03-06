import { ethers } from 'hardhat';

export const getBlockTime = async (blockNumber: number): Promise<number> =>
    (await ethers.provider.getBlock(blockNumber))?.timestamp ?? 0;

export const getCurrentTime = async (): Promise<number> => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const blockTime = await getBlockTime(blockNumber);
    return blockTime;
};

export const mineBlock = async (time: number): Promise<void> => {
    await ethers.provider.send('evm_mine', [time]);
};
