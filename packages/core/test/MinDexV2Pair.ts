import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import { parseEther } from 'viem'

describe('MinDexV2Pair', () => {
  async function deployMinDexSwapV2PairFixture() {
    const [owner, otherAccount] = await hre.viem.getWalletClients()
    const token0 = await hre.viem.deployContract('Token', [
      'Token A',
      'TKNA',
      parseEther('10'),
    ])
    const token1 = await hre.viem.deployContract('Token', [
      'Token B',
      'TKNB',
      parseEther('10'),
    ])
    const minDexV2Pair = await hre.viem.deployContract('MinDexV2Pair', [
      token0.address,
      token1.address,
    ])
    const publicClient = await hre.viem.getPublicClient()
    return {
      owner,
      otherAccount,
      minDexV2Pair,
      token0,
      token1,
      publicClient,
    }
  }

  describe('Deployment', () => {
    it('Should set the right token address', async function () {
      const { minDexV2Pair, token0, token1 } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      expect((await minDexV2Pair.read.token0()).toLowerCase()).to.eq(
        token0.address.toLowerCase()
      )
      expect((await minDexV2Pair.read.token1()).toLowerCase()).to.eq(
        token1.address.toLowerCase()
      )
    })
  })

  describe('Mint', () => {
    it('mint bootstraps', async function () {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])

      await minDexV2Pair.write.mint()
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        parseEther('1') - BigInt(1000)
      )

      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(parseEther('1'))
      expect(reserves[1]).to.eq(parseEther('1'))

      expect(await minDexV2Pair.read.totalSupply()).to.eq(parseEther('1'))
    })
    it('mint when there is liquidity', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint()

      await token0.write.transfer([minDexV2Pair.address, parseEther('2')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        parseEther('3') - BigInt(1000)
      )

      expect(await minDexV2Pair.read.totalSupply()).to.eq(parseEther('3'))
      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(parseEther('3'))
      expect(reserves[1]).to.eq(parseEther('3'))
    })
    it('mint unbalanced', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint()

      await token0.write.transfer([minDexV2Pair.address, parseEther('2')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])

      await minDexV2Pair.write.mint()
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        parseEther('2') - BigInt(1000)
      )

      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(parseEther('3'))
      expect(reserves[1]).to.eq(parseEther('2'))
    })
  })
})
