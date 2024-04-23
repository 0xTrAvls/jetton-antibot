import { Blockchain, SandboxContract, TreasuryContract, internal, BlockchainSnapshot } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { JettonAntiBotWallet } from '../wrappers/JettonAntiBotWallet';
import { JettonAntiBotMinter, jettonAntiBotContentToCell, AntiBotData, antiBotDataToCell } from '../wrappers/JettonAntiBotMinter';
import { AntiBot } from '../wrappers/AntiBot';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Op, Errors } from '../wrappers/Constants';
import { randomAddress, getRandomTon, differentAddress, getRandomInt, testJettonTransfer, testJettonInternalTransfer, testJettonNotification, testJettonBurnNotification } from '../wrappers/utils';


/*
   These tests check compliance with the TEP-74 and TEP-89,
   but also checks some implementation details.
   If you want to keep only TEP-74 and TEP-89 compliance tests,
   you need to remove/modify the following tests:
     mint tests (since minting is not covered by standard)
     exit_codes
     prove pathway
*/

//jetton params

let fwd_fee = 1804014n,
    gas_consumption = 15000000n,
    min_tons_for_storage = 10000000n;
//let fwd_fee = 1804014n, gas_consumption = 14000000n, min_tons_for_storage = 10000000n;

describe('JettonWallet', () => {
    let jwallet_code = new Cell();
    let minter_code = new Cell();
    let anti_bot_code = new Cell();
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let notDeployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonAntiBotMinter>;
    let antiBot: SandboxContract<AntiBot>;
    let userWallet: any;
    let defaultContent: Cell;

    beforeAll(async () => {
        jwallet_code = await compile('JettonAntiBotWallet');
        minter_code = await compile('JettonAntiBotMinter');
        anti_bot_code = await compile('AntiBot');
        blockchain = await Blockchain.create(); blockchain.now = 30;
        deployer = await blockchain.treasury('deployer');
        notDeployer = await blockchain.treasury('notDeployer');

        defaultContent = jettonAntiBotContentToCell({
            type: 1,
            uri: 'https://ton.org',
            antiBotData: antiBotDataToCell({
                amount_limit_per_trade: toNano('1'),
                amount_limit_per_block: toNano('1000'),
                timer_limit_per_trade: 10n,
                disable_time: 100000000n,
                last_block_time: 0n,
                last_block_amount: 0n,
            })
        });

        jettonMinter = blockchain.openContract(
            JettonAntiBotMinter.createFromConfig(
                {
                    admin: deployer.address,
                    content: defaultContent,
                    wallet_code: jwallet_code,
                },
                minter_code,
            ),
        );
        userWallet = async (address: Address) =>
            blockchain.openContract(JettonAntiBotWallet.createFromAddress(await jettonMinter.getWalletAddress(address)));
    });

    // implementation detail
    it('should deploy', async () => {
        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('100'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });
    });

    // implementation detail
    it('minter admin should be able to mint jettons', async () => {
        // can mint from deployer
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = toNano('1000.23');
        const mintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address,
            initialJettonBalance,
            toNano('0.05'),
            toNano('1'),
        );

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: deployerJettonWallet.address,
            deploy: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            // excesses
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
        });

        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply + initialJettonBalance);
        initialTotalSupply += initialJettonBalance;
        // can mint from deployer again
        let additionalJettonBalance = toNano('2.31');
        await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address,
            additionalJettonBalance,
            toNano('0.05'),
            toNano('1'),
        );
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance + additionalJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply + additionalJettonBalance);
        initialTotalSupply += additionalJettonBalance;
        // can mint to other address
        let otherJettonBalance = toNano('3.12');
        await jettonMinter.sendMint(
            deployer.getSender(),
            notDeployer.address,
            otherJettonBalance,
            toNano('0.05'),
            toNano('1'),
        );
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(otherJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply + otherJettonBalance);
    });

    // implementation detail
    it('not a minter admin should not be able to mint jettons', async () => {
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        const unAuthMintResult = await jettonMinter.sendMint(
            notDeployer.getSender(),
            deployer.address,
            toNano('777'),
            toNano('0.05'),
            toNano('1'),
        );

        expect(unAuthMintResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: jettonMinter.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_mint_request
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    // Implementation detail
    it('minter admin can change admin', async () => {
        const adminBefore = await jettonMinter.getAdminAddress();
        expect(adminBefore).toEqualAddress(deployer.address);
        let res = await jettonMinter.sendChangeAdmin(deployer.getSender(), notDeployer.address);
        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            on: jettonMinter.address,
            success: true,
        });

        const adminAfter = await jettonMinter.getAdminAddress();
        expect(adminAfter).toEqualAddress(notDeployer.address);
        await jettonMinter.sendChangeAdmin(notDeployer.getSender(), deployer.address);
        expect((await jettonMinter.getAdminAddress()).equals(deployer.address)).toBe(true);
    });
    it('not a minter admin can not change admin', async () => {
        const adminBefore = await jettonMinter.getAdminAddress();
        expect(adminBefore).toEqualAddress(deployer.address);
        let changeAdmin = await jettonMinter.sendChangeAdmin(notDeployer.getSender(), notDeployer.address);
        expect((await jettonMinter.getAdminAddress()).equals(deployer.address)).toBe(true);
        expect(changeAdmin.transactions).toHaveTransaction({
            from: notDeployer.address,
            on: jettonMinter.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_change_admin_request
        });
    });

    it('minter admin can change content', async () => {
        let newContent = jettonAntiBotContentToCell({
            type: 1,
            uri: 'https://ton.org',
            antiBotData: antiBotDataToCell({
                amount_limit_per_trade: toNano('1'),
                amount_limit_per_block: toNano('1000'),
                timer_limit_per_trade: 10n,
                disable_time: 100000000n,
                last_block_time: 0n,
                last_block_amount: 0n,
            })
        });

        expect((await jettonMinter.getContent()).equals(defaultContent)).toBe(true);
        let changeContent = await jettonMinter.sendChangeContent(deployer.getSender(), newContent);
        expect((await jettonMinter.getContent()).equals(newContent)).toBe(true);
        changeContent = await jettonMinter.sendChangeContent(deployer.getSender(), defaultContent);
        expect((await jettonMinter.getContent()).equals(defaultContent)).toBe(true);
    });
    it('not a minter admin can not change content', async () => {
        let newContent = beginCell().storeUint(1, 1).endCell();
        let changeContent = await jettonMinter.sendChangeContent(notDeployer.getSender(), newContent);
        expect((await jettonMinter.getContent()).equals(defaultContent)).toBe(true);
        expect(changeContent.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: jettonMinter.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_change_content_request
        });
    });

    it('wallet owner should be able to send jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            null,
        );
        expect(sendResult.transactions).toHaveTransaction({
            //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });
        expect(sendResult.transactions).toHaveTransaction({
            //notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address,
            value: forwardAmount,
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2 + sentAmount);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('wallet should not able to send jettons too close', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('1.5');
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            null,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
            success: false,
            exitCode: Errors.TIME_DILATION_NOT_ENOUGH
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('wallet should not able to send too much jettons', async () => {
        blockchain.now = 50;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('1.5');
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            null,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
            success: false,
            exitCode: Errors.AMOUNT_LIMIT_PER_TRADE_OVERFLOW
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('not wallet owner should not be able to send jettons', async () => {
        blockchain.now = 100;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('0.5');
        const sendResult = await deployerJettonWallet.sendTransfer(
            notDeployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            toNano('0.05'),
            null,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_owner, //error::unauthorized_transfer
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('correctly sends forward_payload', async () => {
        blockchain.now = 100;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = toNano('0.05');
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });
        /*
        transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16)
                                      sender:MsgAddress forward_payload:(Either Cell ^Cell)
                                      = InternalMsgBody;
        */
        expect(sendResult.transactions).toHaveTransaction({
            //notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address,
            value: forwardAmount,
            body: beginCell()
                .storeUint(Op.transfer_notification, 32)
                .storeUint(0, 64) //default queryId
                .storeCoins(sentAmount)
                .storeAddress(deployer.address)
                .storeUint(1, 1)
                .storeRef(forwardPayload)
                .endCell(),
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2 + sentAmount);
    });

    it('no forward_ton_amount - no forward', async () => {
        blockchain.now = 120;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonAntiBotBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = 0n;
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('0.2'), //tons
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });

        expect(sendResult.transactions).not.toHaveTransaction({
            //no notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address,
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2 + sentAmount);
    });

    it('check revert on not enough tons for forward', async () => {
        blockchain.now = 140;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        await deployer.send({ value: toNano('1'), bounce: false, to: deployerJettonWallet.address });
        let sentAmount = toNano('0.1');
        let forwardAmount = toNano('0.3');
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            forwardAmount, // not enough tons, no tons for gas
            sentAmount,
            notDeployer.address,
            deployer.address,
            null,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_enough_ton, //error::not_enough_tons
        });
        // Make sure value bounced
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
    });

    // implementation detail
    it('works with minimal ton amount', async () => {
        blockchain.now = 200;
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        const someAddress = Address.parse('EQD__________________________________________0vo');
        const someJettonWallet = await userWallet(someAddress);
        let initialJettonBalance2 = await someJettonWallet.getJettonAntiBotBalance();
        await deployer.send({ value: toNano('1'), bounce: false, to: deployerJettonWallet.address });
        let forwardAmount = toNano('0.3');
        /*
                     forward_ton_amount +
                     fwd_count * fwd_fee +
                     (2 * gas_consumption + min_tons_for_storage));
        */
        let minimalFee = 2n * fwd_fee + 2n * gas_consumption + min_tons_for_storage;
        let sentAmount = forwardAmount + minimalFee; // not enough, need >
        let forwardPayload = null;
        let tonBalance = (await blockchain.getContract(deployerJettonWallet.address)).balance;
        let tonBalance2 = (await blockchain.getContract(someJettonWallet.address)).balance;
        let sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            sentAmount,
            sentAmount,
            someAddress,
            deployer.address,
            null,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_enough_ton, //error::not_enough_tons
        });
        sentAmount += toNano('0.5'); // now enough
        sendResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            sentAmount,
            sentAmount,
            someAddress,
            deployer.address,
            null,
            forwardAmount,
            forwardPayload,
        );
        expect(sendResult.transactions).toHaveTransaction({
            //no excesses
            from: someJettonWallet.address,
            to: deployer.address,
        });
        /*
        transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16)
                                      sender:MsgAddress forward_payload:(Either Cell ^Cell)
                                      = InternalMsgBody;
        */
        expect(sendResult.transactions).toHaveTransaction({
            //notification
            from: someJettonWallet.address,
            to: someAddress,
            value: forwardAmount,
            body: beginCell()
                .storeUint(Op.transfer_notification, 32)
                .storeUint(0, 64) //default queryId
                .storeCoins(sentAmount)
                .storeAddress(deployer.address)
                .storeUint(0, 1)
                .endCell(),
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await someJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance2 + sentAmount);

        tonBalance = (await blockchain.getContract(deployerJettonWallet.address)).balance;
        expect((await blockchain.getContract(someJettonWallet.address)).balance).toBeGreaterThan(min_tons_for_storage);
    });

//     // implementation detail
//     it('wallet does not accept internal_transfer not from wallet', async () => {
//         const deployerJettonWallet = await userWallet(deployer.address);
//         let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
//         /*
//   internal_transfer  query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
//                      response_address:MsgAddress
//                      forward_ton_amount:(VarUInteger 16)
//                      forward_payload:(Either Cell ^Cell)
//                      = InternalMsgBody;
// */
//         let internalTransfer = beginCell()
//             .storeUint(0x178d4519, 32)
//             .storeUint(0, 64) //default queryId
//             .storeCoins(toNano('0.01'))
//             .storeAddress(deployer.address)
//             .storeAddress(deployer.address)
//             .storeCoins(toNano('0.05'))
//             .storeUint(0, 1)
//             .endCell();
//         const sendResult = await blockchain.sendMessage(
//             internal({
//                 from: notDeployer.address,
//                 to: deployerJettonWallet.address,
//                 body: internalTransfer,
//                 value: toNano('0.3'),
//             }),
//         );
//         expect(sendResult.transactions).toHaveTransaction({
//             from: notDeployer.address,
//             to: deployerJettonWallet.address,
//             aborted: true,
//             exitCode: Errors.not_valid_wallet, //error::unauthorized_incoming_transfer
//         });
//         expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
//     });

    it('wallet owner should be able to burn jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        let burnAmount = toNano('0.01');
        const sendResult = await deployerJettonWallet.sendBurn(
            deployer.getSender(),
            toNano('0.1'), // ton amount
            burnAmount,
            deployer.address,
            null,
        ); // amount, response address, custom payload
        expect(sendResult.transactions).toHaveTransaction({
            //burn notification
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
        });
        expect(sendResult.transactions).toHaveTransaction({
            //excesses
            from: jettonMinter.address,
            to: deployer.address,
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - burnAmount);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply - burnAmount);
    });

    it('not wallet owner should not be able to burn jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        let burnAmount = toNano('0.01');
        const sendResult = await deployerJettonWallet.sendBurn(
            notDeployer.getSender(),
            toNano('0.1'), // ton amount
            burnAmount,
            deployer.address,
            null,
        ); // amount, response address, custom payload
        expect(sendResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_owner, //error::unauthorized_transfer
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('wallet owner can not burn more jettons than it has', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        let burnAmount = initialJettonBalance + 1n;
        const sendResult = await deployerJettonWallet.sendBurn(
            deployer.getSender(),
            toNano('0.1'), // ton amount
            burnAmount,
            deployer.address,
            null,
        ); // amount, response address, custom payload
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.balance_error, //error::not_enough_jettons
        });
        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('minimal burn message fee', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonAntiBotBalance();
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        let burnAmount = toNano('0.01');
        let fwd_fee = 1492012n /*1500012n*/,
            gas_consumption = 15000000n;
        let minimalFee = fwd_fee + 2n * gas_consumption;

        const sendLow = await deployerJettonWallet.sendBurn(
            deployer.getSender(),
            minimalFee, // ton amount
            burnAmount,
            deployer.address,
            null,
        ); // amount, response address, custom payload

        expect(sendLow.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_enough_gas, //error::burn_fee_not_matched
        });

        const sendExcess = await deployerJettonWallet.sendBurn(
            deployer.getSender(),
            minimalFee + 1n,
            burnAmount,
            deployer.address,
            null,
        );

        expect(sendExcess.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            success: true,
        });

        expect(await deployerJettonWallet.getJettonAntiBotBalance()).toEqual(initialJettonBalance - burnAmount);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply - burnAmount);
    });

    it('minter should only accept burn messages from jetton wallets', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        const burnAmount = toNano('1');
        const burnNotification = (amount: bigint, addr: Address) => {
            return beginCell()
                .storeUint(Op.burn_notification, 32)
                .storeUint(0, 64)
                .storeCoins(amount)
                .storeAddress(addr)
                .storeAddress(deployer.address)
                .endCell();
        };

        let res = await blockchain.sendMessage(
            internal({
                from: deployerJettonWallet.address,
                to: jettonMinter.address,
                body: burnNotification(burnAmount, randomAddress(0)),
                value: toNano('0.1'),
            }),
        );

        expect(res.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
            aborted: true,
            exitCode: Errors.unouthorized_burn, // Unauthorized burn
        });

        res = await blockchain.sendMessage(
            internal({
                from: deployerJettonWallet.address,
                to: jettonMinter.address,
                body: burnNotification(burnAmount, deployer.address),
                value: toNano('0.1'),
            }),
        );

        expect(res.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMinter.address,
            success: true,
        });
    });

    it('owner should able to change white list', async() => {
        let deployerWallet = await userWallet(deployer.address);
        const updateWhiteListResult = await jettonMinter.sendUpdateWhiteList(
            deployer.getSender(),
            deployer.address,
            toNano('0.05'),
            -1,
        );

        expect(updateWhiteListResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: deployerWallet.address,
            success: true,
        });

        let antiBotData = await deployerWallet.getJettonAntiBotData();
        // console.log(antiBotData);
        expect(antiBotData.isWhiteList).toEqual(-1);
    });
});
