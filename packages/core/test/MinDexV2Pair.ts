import {
  loadFixture,
  time,
  reset,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { assert, expect } from 'chai'
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
    async function assertCumulativePrices(price0: bigint, price1: bigint) {
      const price0CumulativeLast =
        await minDexV2Pair.read.price0CumulativeLast()
      const price1CumulativeLast =
        await minDexV2Pair.read.price1CumulativeLast()
      expect(price0CumulativeLast).to.eq(price0)
      expect(price1CumulativeLast).to.eq(price1)
    }
    async function calculateCurrentPrice() {
      const reserves = await minDexV2Pair.read.getReserves()
      const Q112 = BigInt(2 ** 112)
      const reserve0 = BigInt(reserves[0])
      const reserve1 = BigInt(reserves[1])
      const price0 = reserve0 > 0 ? (reserve1 * Q112) / reserve0 : BigInt(0)
      const price1 = reserve1 > 0 ? (reserve0 * Q112) / reserve1 : BigInt(0)
      return [price0, price1]
    }

    async function assertBlockTimestampLast(expected: number) {
      const [, , blockTimestampLast] = await minDexV2Pair.read.getReserves()
      expect(blockTimestampLast).to.eq(expected)
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
      calculateCurrentPrice,
      assertCumulativePrices,
      assertBlockTimestampLast,
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

    it('throws when swapping zero out', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      // revertedWith 不支持 viem?
      await expect(
        minDexV2Pair.write.swap([BigInt(0), BigInt(0), owner.account.address])
      ).to.be.rejectedWith(/InsufficientOutputAmount/)
    })

    it('throws when there is insufficient liquidity', async () => {
      const { minDexV2Pair, token0, token1, owner } = await loadFixture(
        deployMinDexSwapV2PairFixture
      )
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      await expect(
        minDexV2Pair.write.swap([
          BigInt(0),
          parseEther('2.1'),
          owner.account.address,
        ])
      ).to.be.rejectedWith(/InsufficientLiquidity/)
      await expect(
        minDexV2Pair.write.swap([
          parseEther('1.1'),
          BigInt(0),
          owner.account.address,
        ])
      ).to.be.rejectedWith(/InsufficientLiquidity/)
    })

    it('swaps when underpriced', async () => {
      const { minDexV2Pair, token0, token1, owner, assertReserves } =
        await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      await token0.write.transfer([minDexV2Pair.address, parseEther('0.1')])
      await minDexV2Pair.write.swap([
        BigInt(0),
        parseEther('0.09'),
        owner.account.address,
      ])
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('1') - parseEther('0.1')
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('2') + parseEther('0.09')
      )
      await assertReserves(
        parseEther('1') + parseEther('0.1'),
        parseEther('2') - parseEther('0.09')
      )
    })

    it('throws when swapping overpriced', async () => {
      const { minDexV2Pair, token0, token1, owner, assertReserves } =
        await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('2')])
      await minDexV2Pair.write.mint()
      await token0.write.transfer([minDexV2Pair.address, parseEther('0.1')])
      await expect(
        minDexV2Pair.write.swap([
          BigInt(0),
          parseEther('0.21'),
          owner.account.address,
        ])
      ).to.be.rejectedWith(/InvalidK/)
      expect(await token0.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('1') - parseEther('0.1')
      )
      expect(await token1.read.balanceOf([owner.account.address])).to.eq(
        parseEther('10') - parseEther('2')
      )
      // revert 之后状态变更未写入
      await assertReserves(parseEther('1'), parseEther('2'))
    })

    it('calculates cumulative prices', async () => {
      const {
        minDexV2Pair,
        token0,
        token1,
        owner,
        calculateCurrentPrice,
        assertCumulativePrices,
        assertBlockTimestampLast,
      } = await loadFixture(deployMinDexSwapV2PairFixture)
      await token0.write.transfer([minDexV2Pair.address, parseEther('1')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      const initialTimestamp = await time.latest()

      await time.setNextBlockTimestamp(initialTimestamp + 10)
      await minDexV2Pair.write.mint()

      const time0 = await time.latest()
      await assertCumulativePrices(BigInt(0), BigInt(0))
      const [initialPrice0, initialPrice1] = await calculateCurrentPrice()

      const time1 = time0 + 10
      await time.setNextBlockTimestamp(time1)
      await minDexV2Pair.write.sync()
      await assertCumulativePrices(
        BigInt(10) * initialPrice0,
        BigInt(10) * initialPrice1
      )
      await assertBlockTimestampLast(time1)

      const time2 = time1 + 10
      await time.setNextBlockTimestamp(time2)
      await minDexV2Pair.write.sync()
      await assertCumulativePrices(
        BigInt(20) * initialPrice0,
        BigInt(20) * initialPrice1
      )
      await assertBlockTimestampLast(time2)

      const time3 = time2 + 10
      await time.setNextBlockTimestamp(time3)
      await minDexV2Pair.write.sync()
      await assertCumulativePrices(
        BigInt(30) * initialPrice0,
        BigInt(30) * initialPrice1
      )
      await assertBlockTimestampLast(time3)

      await token0.write.transfer([minDexV2Pair.address, parseEther('2')])
      await token1.write.transfer([minDexV2Pair.address, parseEther('1')])
      const time4 = (await time.latest()) + 10
      await time.setNextBlockTimestamp(time4)
      await minDexV2Pair.write.mint()
      await assertBlockTimestampLast(time4)
      const secondMintPrice0 =
        (BigInt(30) + BigInt(time4 - time3)) * initialPrice0
      const secondMintPrice1 =
        (BigInt(30) + BigInt(time4 - time3)) * initialPrice1
      await assertCumulativePrices(secondMintPrice0, secondMintPrice1)
      await assertBlockTimestampLast(time4)
      const [newPrice0, newPrice1] = await calculateCurrentPrice()

      const time5 = time4 + 10
      await time.setNextBlockTimestamp(time5)
      await minDexV2Pair.write.sync()
      await assertCumulativePrices(
        secondMintPrice0 + BigInt(10) * newPrice0,
        secondMintPrice1 + BigInt(10) * newPrice1
      )
      await assertBlockTimestampLast(time5)

      const time6 = time5 + 10
      await time.setNextBlockTimestamp(time6)
      await minDexV2Pair.write.sync()
      await assertCumulativePrices(
        secondMintPrice0 + BigInt(20) * newPrice0,
        secondMintPrice1 + BigInt(20) * newPrice1
      )
      await assertBlockTimestampLast(time6)
    })
  })
})
