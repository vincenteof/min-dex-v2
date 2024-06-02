// SPDX-License-Identifier: ISC
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

error InsufficientLiquidityMinted();
error InsufficientLiquidityBurned();
error TransferFailed();

contract MinDexV2Pair is ERC20 {
    using Math for uint256;

    uint256 constant MINIMUM_LIQUIDITY = 1000;

    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;

    event Burn(address indexed sender, uint256 amount0, uint256 amount1);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Sync(uint256 reserve0, uint256 reserve1);

    constructor(
        address _token0,
        address _token1
    ) ERC20("MinDexSwapV2Pair", "MDSV2P") {
        token0 = _token0;
        token1 = _token1;
    }

    function mint() public {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 liquidity;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(this), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }

        if (liquidity <= 0) {
            revert InsufficientLiquidityMinted();
        }

        _mint(msg.sender, liquidity);
        _update(balance0, balance1);

        emit Mint(msg.sender, amount0, amount1);
    }

    function burn() public {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(msg.sender);

        uint256 _totalSupply = totalSupply();
        uint256 amount0 = (liquidity * balance0) / _totalSupply;
        uint256 amount1 = (liquidity * balance1) / _totalSupply;

        if (amount0 <= 0 || amount1 <= 0) {
            revert InsufficientLiquidityBurned();
        }

        _burn(msg.sender, liquidity);

        _safeTransfer(token0, msg.sender, amount0);
        _safeTransfer(token1, msg.sender, amount1);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));

        _update(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1);
    }

    function sync() public {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this))
        );
    }

    function getReserves() public view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, 0);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);

        emit Sync(reserve0, reserve1);
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        bool success = IERC20(token).transfer(to, value);
        if (!success) {
            revert TransferFailed();
        }
    }
}
