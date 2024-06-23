// SPDX-License-Identifier: ISC
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./libraries/UQ112x112.sol";
// import "hardhat/console.sol";

error AlreadyInitialized();
error InsufficientLiquidityMinted();
error InsufficientLiquidityBurned();
error TransferFailed();
error InsufficientOutputAmount();
error InsufficientLiquidity();
error InvalidK();
error BalanceOverflow();

contract MinDexV2Pair is ERC20 {
    using Math for uint256;
    using UQ112x112 for uint224;

    uint256 constant MINIMUM_LIQUIDITY = 1000;

    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public price0CummulativeLast;
    uint256 public price1CummulativeLast;

    event Burn(address indexed sender, uint256 amount0, uint256 amount1);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Sync(uint256 reserve0, uint256 reserve1);
    event Swap(
        address indexed sender,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    constructor() ERC20("MinDexSwapV2Pair", "MDSV2P") {}

    function initialize(address _token0, address _token1) public {
        if (token0 != address(0) || token1 != address(0)) {
            revert AlreadyInitialized();
        }
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
        _update(balance0, balance1, reserve0, reserve1);

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

        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        _update(balance0, balance1, _reserve0, _reserve1);

        emit Burn(msg.sender, amount0, amount1);
    }

    function sync() public {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            _reserve0,
            _reserve1
        );
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) public {
        if (amount0Out == 0 && amount1Out == 0) {
            revert InsufficientOutputAmount();
        }
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();

        // console.log("amount0Out", amount0Out);
        // console.log("amount1Out", amount1Out);
        // console.log("_reserve0", _reserve0);
        // console.log("_reserve1", _reserve1);

        if (amount0Out > _reserve0 || amount1Out > _reserve1) {
            revert InsufficientLiquidity();
        }
        // console.log("a");
        uint256 balance0 = IERC20(token0).balanceOf(address(this)) - amount0Out;
        uint256 balance1 = IERC20(token1).balanceOf(address(this)) - amount1Out;

        // console.log("b");
        // console.log("balance0", balance0);
        // console.log("balance1", balance1);

        // here to add cast to avoid overflow
        if (balance0 * balance1 < uint256(_reserve0) * uint256(_reserve1)) {
            revert InvalidK();
        }

        _update(balance0, balance1, _reserve0, _reserve1);

        if (amount0Out > 0) {
            _safeTransfer(token0, to, amount0Out);
        }
        if (amount1Out > 0) {
            _safeTransfer(token1, to, amount1Out);
        }
        emit Swap(msg.sender, amount0Out, amount1Out, to);
    }

    function getReserves() public view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) {
            revert BalanceOverflow();
        }

        unchecked {
            uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
            if (timeElapsed > 0 && _reserve0 > 0 && _reserve1 > 0) {
                price0CummulativeLast +=
                    uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) *
                    timeElapsed;
                price1CummulativeLast +=
                    uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) *
                    timeElapsed;
            }
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);

        emit Sync(reserve0, reserve1);
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        // (bool success, bytes memory data) = token.call(
        //     abi.encodeWithSignature("transfer(address,uint256)", to, value)
        // );
        // if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
        //     revert TransferFailed();
        // }

        // this implementation avoid using call but is more gas-intensive
        try IERC20(token).transfer(to, value) returns (bool success) {
            if (!success) {
                revert TransferFailed();
            }
        } catch {
            revert TransferFailed();
        }
    }
}
