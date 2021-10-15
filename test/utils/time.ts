import { ethers } from 'hardhat'

export async function getBlockTime(blockNumber: any) {
  return (await ethers.provider.getBlock(blockNumber)).timestamp;
}

export async function getCurrentTime() {
  const blockNumber = await ethers.provider.getBlockNumber();
  return await getBlockTime(blockNumber);
}

export async function increaseTime(time: any) {
  await ethers.provider.send('evm_increaseTime', [time]);
}

export async function setNextBlockTime(time: any) {
  await ethers.provider.send('evm_setNextBlockTimestamp', [time]);
}

export async function mineBlock(time: any) {
  await ethers.provider.send('evm_mine', [time]);
}
