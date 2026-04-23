// SPDX-License-Identifier: MIT
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity ^0.8.28;

contract WithdrawVerifier {
	// Scalar field size
	uint256 constant r =
		21888242871839275222246405745257275088548364400416034343698204186575808495617;
	// Base field size
	uint256 constant q =
		21888242871839275222246405745257275088696311157297823662689037894645226208583;

	// Verification Key data
	uint256 constant alphax =
		7534391703259103334595440366232750772312421595143632053170334978965438366193;
	uint256 constant alphay =
		7014999165486749890474784091114269141851763575622082627539394214020148662659;
	uint256 constant betax1 =
		12186548969310461159363779142183915302330232909573126054148178045632530336082;
	uint256 constant betax2 =
		15236471150230120799436461968623781577447694206182728500740401211435440118209;
	uint256 constant betay1 =
		620115424432433197673603695450797514255805305063790091307981891644573325244;
	uint256 constant betay2 =
		18429982471052062860387770188626904143902267383489852094173216755396120632288;
	uint256 constant gammax1 =
		11559732032986387107991004021392285783925812861821192530917403151452391805634;
	uint256 constant gammax2 =
		10857046999023057135944570762232829481370756359578518086990519993285655852781;
	uint256 constant gammay1 =
		4082367875863433681332203403145435568316851327593401208105741076214120093531;
	uint256 constant gammay2 =
		8495653923123431417604973247489272438418190587263600148770280649306958101930;
	uint256 constant deltax1 =
		1955290797721422277100594817267782216207551139345396957271274064808010804817;
	uint256 constant deltax2 =
		14910440853784878302921862138352661619566572318626662381111420345749843357915;
	uint256 constant deltay1 =
		3769026365822801644897778074083923020407965597846907724811913246982034125863;
	uint256 constant deltay2 =
		21109861175085188264201318185098051498218130291560731271239864559871219301313;

	uint256 constant IC0x =
		5585551855542912835818509889325723419507612802976775338882441893627153365848;
	uint256 constant IC0y =
		21489687002140726038160958103020744106830712241994062213489949003475050317381;

	uint256 constant IC1x =
		13122280819769813330004499777577820324373996386405541552791042632789697403744;
	uint256 constant IC1y =
		10673534884079241066284734699773418514104271977486604654574801467213579381131;

	uint256 constant IC2x =
		8955897363737381503841869979309611539783035006263172528140249736607673032423;
	uint256 constant IC2y =
		19698633657823506893886650299978296378863426769572792767751399197586106323454;

	uint256 constant IC3x =
		1077683429805380400946842846063937009919992489093610969463622263566139860394;
	uint256 constant IC3y =
		19865684051272608824538014256044742634567468045067726375812602364825007837677;

	uint256 constant IC4x =
		7254975011138327661972738301641554274577662948869021131672560320994435983317;
	uint256 constant IC4y =
		15256366853466153769487413837470731024965215395373778821379481212315566726625;

	// Memory data
	uint16 constant pVk = 0;
	uint16 constant pPairing = 128;

	uint16 constant pLastMem = 896;

	function verifyProof(
		uint[2] calldata _pA,
		uint[2][2] calldata _pB,
		uint[2] calldata _pC,
		uint[4] calldata _pubSignals
	) public view returns (bool) {
		assembly {
			function checkField(v) {
				if iszero(lt(v, r)) {
					mstore(0, 0)
					return(0, 0x20)
				}
			}

			// G1 function to multiply a G1 value(x,y) to value in an address
			function g1_mulAccC(pR, x, y, s) {
				let success
				let mIn := mload(0x40)
				mstore(mIn, x)
				mstore(add(mIn, 32), y)
				mstore(add(mIn, 64), s)

				success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

				if iszero(success) {
					mstore(0, 0)
					return(0, 0x20)
				}

				mstore(add(mIn, 64), mload(pR))
				mstore(add(mIn, 96), mload(add(pR, 32)))

				success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

				if iszero(success) {
					mstore(0, 0)
					return(0, 0x20)
				}
			}

			function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
				let _pPairing := add(pMem, pPairing)
				let _pVk := add(pMem, pVk)

				mstore(_pVk, IC0x)
				mstore(add(_pVk, 32), IC0y)

				// Compute the linear combination vk_x

				g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

				g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

				g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))

				g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))

				// -A
				mstore(_pPairing, calldataload(pA))
				mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

				// B
				mstore(add(_pPairing, 64), calldataload(pB))
				mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
				mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
				mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

				// alpha1
				mstore(add(_pPairing, 192), alphax)
				mstore(add(_pPairing, 224), alphay)

				// beta2
				mstore(add(_pPairing, 256), betax1)
				mstore(add(_pPairing, 288), betax2)
				mstore(add(_pPairing, 320), betay1)
				mstore(add(_pPairing, 352), betay2)

				// vk_x
				mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
				mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))

				// gamma2
				mstore(add(_pPairing, 448), gammax1)
				mstore(add(_pPairing, 480), gammax2)
				mstore(add(_pPairing, 512), gammay1)
				mstore(add(_pPairing, 544), gammay2)

				// C
				mstore(add(_pPairing, 576), calldataload(pC))
				mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

				// delta2
				mstore(add(_pPairing, 640), deltax1)
				mstore(add(_pPairing, 672), deltax2)
				mstore(add(_pPairing, 704), deltay1)
				mstore(add(_pPairing, 736), deltay2)

				let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

				isOk := and(success, mload(_pPairing))
			}

			let pMem := mload(0x40)
			mstore(0x40, add(pMem, pLastMem))

			// Validate that all evaluations ∈ F

			checkField(calldataload(add(_pubSignals, 0)))

			checkField(calldataload(add(_pubSignals, 32)))

			checkField(calldataload(add(_pubSignals, 64)))

			checkField(calldataload(add(_pubSignals, 96)))

			// Validate all evaluations
			let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

			mstore(0, isValid)
			return(0, 0x20)
		}
	}
}
