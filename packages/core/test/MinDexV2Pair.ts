import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import { parseEther } from 'viem'

describe('MinDexV2Pair', () => {
  async function deployMinDexSwapV2PairFixture() {
    const [owner, other] = await hre.viem.getWalletClients()
    const token0 = await hre.viem.deployContract('Token', [
      'Token A',
      'TKNA',
      parseEther('10'),
    ])
    const token0ForOther = await hre.viem.getContractAt(
      'Token',
      token0.address,
      { client: { wallet: other } }
    )
    const token1 = await hre.viem.deployContract('Token', [
      'Token B',
      'TKNB',
      parseEther('10'),
    ])
    const token1ForOther = await hre.viem.getContractAt(
      'Token',
      token1.address,
      { client: { wallet: other } }
    )
    const minDexV2Pair = await hre.viem.deployContract('MinDexV2Pair', [])
    minDexV2Pair.write.initialize([token0.address, token1.address])
    const minDexV2PairForOther = await hre.viem.getContractAt(
      'MinDexV2Pair',
      minDexV2Pair.address,
      { client: { wallet: other } }
    )
    const publicClient = await hre.viem.getPublicClient()

    async function assertReserves(reserve0: bigint, reserve1: bigint) {
      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(reserve0)
      expect(reserves[1]).to.eq(reserve1)
    }

    return {
      owner,
      other,
      minDexV2Pair,
      minDexV2PairForOther,
      token0,
      token0ForOther,
      token1,
      token1ForOther,
      publicClient,
      assertReserves,
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
    it('mints bootstraps', async function () {
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
    it('mints when there is liquidity', async () => {
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
    it('mints unbalanced', async () => {
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

  describe('Burn', () => {
    it('burns for basic case', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint()
      await minDexV2Pair.write.burn()

      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        BigInt(0)
      )
      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(BigInt(1000))
      expect(reserves[1]).to.eq(BigInt(1000))
      expect(await minDexV2Pair.read.totalSupply()).to.eq(BigInt(1000))
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - BigInt(1000)
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - BigInt(1000)
      )
    })

    it('burns unbalanced', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint()
      await token0.write.transfer([minDexV2Pair.address, parseEther('2')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint()
      await minDexV2Pair.write.burn()

      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        BigInt(0)
      )
      // total: 2e
      // owner share: 2e - 1000
      // (2e - 1000) / 2e * 2e
      // (2e - 1000) / 2e * 3e
      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(BigInt(1500))
      expect(reserves[1]).to.eq(BigInt(1000))
      expect(await minDexV2Pair.read.totalSupply()).to.eq(BigInt(1000))
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - BigInt(1500)
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - BigInt(1000)
      )
    })

    it('burns unbalanced different users', async () => {
      const {
        minDexV2Pair,
        minDexV2PairForOther,
        token0,
        token1,
        token0ForOther,
        token1ForOther,
        owner,
        other,
      } = await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([other.account.address, parseEther('1')])
      await token1.write.transfer([other.account.address, parseEther('1')])
      await token0ForOther.write.transfer([
        minDexV2Pair.address,
        parseEther('1'),
      ])
      await token1ForOther.write.transfer([
        minDexV2Pair.address,
        parseEther('1'),
      ])
      await minDexV2PairForOther.write.mint() // lpt 1
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        BigInt(0)
      )
      expect(await minDexV2Pair.read.balanceOf([other.account.address])).to.eq(
        parseEther('1') - BigInt(1000)
      )
      expect(await minDexV2Pair.read.totalSupply()).to.eq(parseEther('1'))
      await token0.write.transfer([minDexV2Pair.address, parseEther('2')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      await minDexV2Pair.write.mint() // lpt 2
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        parseEther('1')
      )
      await minDexV2Pair.write.burn()
      expect(await minDexV2Pair.read.balanceOf([owner.account.address])).to.eq(
        BigInt(0)
      )
      const reserves = await minDexV2Pair.read.getReserves()
      expect(reserves[0]).to.eq(parseEther('1.5'))
      expect(reserves[1]).to.eq(parseEther('1'))
      expect(await minDexV2Pair.read.totalSupply()).to.eq(parseEther('1'))
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('8.5')
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('9')
      )
    })

    it('swaps for basic case', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      await token0.write.transfer([minDexV2Pair.address, parseEther('0.1')])
      await minDexV2Pair.write.swap([
        BigInt(0),
        parseEther('0.18'),
        owner.account.address,
      ])
    })

    it('swaps for basic case in another direction', async () => {
      const { minDexV2Pair, token0, token1, owner, assertReserves } =
        await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()

      await token1.write.transfer([minDexV2Pair.address, parseEther('0.2')])
      await minDexV2Pair.write.swap([
        parseEther('0.09'),
        BigInt(0),
        owner.account.address,
      ])
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('1') + parseEther('0.09')
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('2') - parseEther('0.2')
      )
      await assertReserves(
        parseEther('1') - parseEther('0.09'),
        parseEther('2') + parseEther('0.2')
      )
    })

    it('swaps bidirectional', async () => {
      const { minDexV2Pair, token0, token1, owner, assertReserves } =
        await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()

      await token0.write.transfer([minDexV2Pair.address, parseEther('0.1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('0.2')])
      await minDexV2Pair.write.swap([
        parseEther('0.09'),
        parseEther('0.18'),
        owner.account.address,
      ])

      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') -
          parseEther('1') -
          parseEther('0.1') +
          parseEther('0.09')
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') -
          parseEther('2') -
          parseEther('0.2') +
          parseEther('0.18')
      )

      await assertReserves(
        parseEther('1') + parseEther('0.1') - parseEther('0.09'),
        parseEther('2') + parseEther('0.2') - parseEther('0.18')
      )
    })
  })
})
