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
    internal as internal_relaxed,
    storeMessageRelaxed,
} from '@ton/core';

import { Op } from './Constants';

export type AntiBotConfig = {
    owner: Address;
    amount_limit_per_trade: bigint;
    amount_limit_per_block: bigint;
    delay_time: bigint;
    time_limit_per_trade: number | bigint;
    disable_time: number | bigint;
};

export function antiBotConfigToCell(config: AntiBotConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeCoins(config.amount_limit_per_trade)
        .storeCoins(config.amount_limit_per_block)
        .storeUint(config.delay_time, 64)
        .storeUint(config.time_limit_per_trade, 64)
        .storeUint(config.disable_time, 64)
        .storeUint(0, 64)
        .storeCoins(0)
        .endCell();
}

export class AntiBot implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new AntiBot(address);
    }

    static createFromConfig(config: AntiBotConfig, code: Cell, workchain = 0) {
        const data = antiBotConfigToCell(config);
        const init = { code, data };
        return new AntiBot(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendPreTransferCheck(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        sender: Address,
        amount: bigint,
        query_id: number | bigint = 0,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.pre_transfer_check, 32)
                .storeUint(query_id, 64)
                .storeAddress(sender)
                .storeCoins(amount)
                .endCell(),
        });
    }

    async getAntiBotData(provider: ContractProvider) {
        const result = await provider.get('get_anti_bot_data', []);
        let owner = result.stack.readAddress();
        let amountLimitPerTrade = result.stack.readBigNumber();
        let amountLimitPerBlock = result.stack.readBigNumber();
        let timeLimitPerTrade = result.stack.readBigNumber();
        let disableTime = result.stack.readBigNumber();
        let lastBlockTime = result.stack.readBigNumber();
        let lastBlockAmount = result.stack.readBigNumber();

        return {
            owner,
            amountLimitPerTrade,
            amountLimitPerBlock,
            timeLimitPerTrade,
            disableTime,
            lastBlockTime,
            lastBlockAmount,
        };
    }

    async getAntiBotOwner(provider: ContractProvider): Promise<Address> {
        return (await this.getAntiBotData(provider)).owner;
    }

    async getAntiBotAmountLimitPerTrade(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).amountLimitPerTrade;
    }

    async getAntiBotAmountLimitPerBlock(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).amountLimitPerBlock;
    }

    async getAntiBotTimeLimitPerTrade(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).timeLimitPerTrade;
    }

    async getAntiBotDisableTime(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).disableTime;
    }

    async getAntiBotLastBlockTime(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).lastBlockTime;
    }

    async getAntiBotLastBlockAmount(provider: ContractProvider): Promise<bigint> {
        return (await this.getAntiBotData(provider)).lastBlockAmount;
    }

    async getUserRecordAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_record_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return res.stack.readAddress();
    }
}
