import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

import { Op } from './Constants';

export type JettonAntiBotWalletConfig = {};

export function jettonAntiBotWalletConfigToCell(config: JettonAntiBotWalletConfig): Cell {
    return beginCell().endCell();
}

export class JettonAntiBotWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonAntiBotWallet(address);
    }

    static createFromConfig(config: JettonAntiBotWalletConfig, code: Cell, workchain = 0) {
        const data = jettonAntiBotWalletConfigToCell(config);
        const init = { code, data };
        return new JettonAntiBotWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getJettonAntiBotBalance(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        return res.stack.readBigNumber();
    }

    async getJettonAntiBotData(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        res.stack.readBigNumber();
        res.stack.readAddress();
        res.stack.readAddress();
        res.stack.readCell();
        let antiBotData = res.stack.readCell();
        let antiBotDataSlice = antiBotData.asSlice();
        let isWhiteList = antiBotDataSlice.loadInt(32);
        let lastTransactionTime = antiBotDataSlice.loadUint(64);
        let disableTime = antiBotDataSlice.loadUint(64);
        return { isWhiteList, lastTransactionTime, disableTime };
    }

    static transferMessage(
        JettonAntiBot_amount: bigint,
        to: Address,
        responseAddress: Address,
        customPayload: Cell | null,
        forward_ton_amount: bigint,
        forwardPayload: Cell | null,
    ) {
        return beginCell()
            .storeCoins(JettonAntiBot_amount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }
    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        jettonAntiBotAmount: bigint,
        to: Address,
        responseAddress: Address,
        customPayload: Cell,
        forward_ton_amount: bigint,
        forwardPayload: Cell,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0xf8a7ea5, 32)
                    .storeUint(0, 64)
                    .storeRef(
                        JettonAntiBotWallet.transferMessage(
                        jettonAntiBotAmount,
                        to,
                        responseAddress,
                        customPayload,
                        forward_ton_amount,
                        forwardPayload))
                    .endCell(),
            value: value,
        });
    }
    /*
      burn#595f07bc query_id:uint64 amount:(VarUInteger 16)
                    response_destination:MsgAddress custom_payload:(Maybe ^Cell)
                    = InternalMsgBody;
    */
    static burnMessage(JettonAntiBot_amount: bigint, responseAddress: Address, customPayload: Cell | null) {
        return beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(0, 64) // op, queryId
            .storeCoins(JettonAntiBot_amount)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .endCell();
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        JettonAntiBot_amount: bigint,
        responseAddress: Address,
        customPayload: Cell,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotWallet.burnMessage(JettonAntiBot_amount, responseAddress, customPayload),
            value: value,
        });
    }
    /*
      withdraw_tons#107c49ef query_id:uint64 = InternalMsgBody;
    */
    static withdrawTonsMessage() {
        return beginCell()
            .storeUint(0x6d8e5e3c, 32)
            .storeUint(0, 64) // op, queryId
            .endCell();
    }

    async sendWithdrawTons(provider: ContractProvider, via: Sender) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotWallet.withdrawTonsMessage(),
            value: toNano('0.1'),
        });
    }
    /*
      withdraw_JettonAntiBots#10 query_id:uint64 wallet:MsgAddressInt amount:Coins = InternalMsgBody;
    */
    static withdrawJettonAntiBotsMessage(from: Address, amount: bigint) {
        return beginCell()
            .storeUint(0x768a50b2, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(from)
            .storeCoins(amount)
            .storeMaybeRef(null)
            .endCell();
    }

    async sendWithdrawJettonAntiBots(provider: ContractProvider, via: Sender, from: Address, amount: bigint) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotWallet.withdrawJettonAntiBotsMessage(from, amount),
            value: toNano('0.1'),
        });
    }
}
