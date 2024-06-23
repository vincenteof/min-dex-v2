// SPDX-License-Identifier: ISC
pragma solidity ^0.8.24;

interface IMinDexV2Factory {
    function pairs(address, address) external pure returns (address);
    function createPair(address, address) external pure returns (address);
}