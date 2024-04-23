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
import { buildJettonOnchainMetadata } from './utils';

export type JettonAntiBotMinterContent = {
    type: 0 | 1;
    uri: string;
    antiBotData: Cell;
};

export type AntiBotData = {
    amount_limit_per_trade: bigint;
    amount_limit_per_block: bigint;
    timer_limit_per_trade: bigint;
    disable_time: bigint;
    last_block_time: bigint;
    last_block_amount: bigint;
};

export type JettonAntiBotMinterConfig = { admin: Address; content: Cell; wallet_code: Cell };

export function antiBotDataToCell(data: AntiBotData): Cell {
    return beginCell()
        .storeCoins(data.amount_limit_per_trade)
        .storeCoins(data.amount_limit_per_block)
        .storeUint(data.timer_limit_per_trade, 64)
        .storeUint(data.disable_time, 64)
        .storeUint(data.last_block_time, 64)
        .storeCoins(data.last_block_amount)
        .endCell();
}

export function jettonAntiBotMinterConfigToCell(config: JettonAntiBotMinterConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.admin)
        .storeRef(config.content)
        .storeRef(config.wallet_code)
        .endCell();
}

export function jettonAntiBotContentToCell(content: JettonAntiBotMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeRef(
            buildJettonOnchainMetadata({
                name: 'Sample Jetton',
                description: 'Anyaxis',
                symbol: 'AA',
                decimals: '9',
                image: 'https://www.svgrepo.com/download/483336/coin-vector.svg',
            }),
        ) //Snake logic under the hood
        .storeRef(content.antiBotData)
        .endCell();
}

export class JettonAntiBotMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonAntiBotMinter(address);
    }

    static createFromConfig(config: JettonAntiBotMinterConfig, code: Cell, workchain = 0) {
        const data = jettonAntiBotMinterConfigToCell(config);
        const init = { code, data };
        return new JettonAntiBotMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    protected static JettonAntiBotInternalTransfer(
        JettonAntiBot_amount: bigint,
        forward_ton_amount: bigint,
        response_addr?: Address,
        query_id: number | bigint = 0,
    ) {
        return beginCell()
            .storeUint(Op.internal_transfer, 32)
            .storeUint(query_id, 64)
            .storeCoins(JettonAntiBot_amount)
            .storeAddress(null)
            .storeAddress(response_addr)
            .storeCoins(forward_ton_amount)
            .storeBit(false)
            .endCell();
    }
    static mintMessage(
        from: Address,
        to: Address,
        JettonAntiBot_amount: bigint,
        forward_ton_amount: bigint,
        total_ton_amount: bigint,
        query_id: number | bigint = 0,
    ) {
        const mintMsg = beginCell()
            .storeUint(Op.internal_transfer, 32)
            .storeUint(0, 64)
            .storeCoins(JettonAntiBot_amount)
            .storeAddress(null)
            .storeAddress(from) // Response addr
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(null)
            .endCell();

        return beginCell()
            .storeUint(Op.mint, 32)
            .storeUint(query_id, 64) // op, queryId
            .storeAddress(to)
            .storeCoins(total_ton_amount)
            .storeCoins(JettonAntiBot_amount)
            .storeRef(mintMsg)
            .endCell();
    }
    async sendMint(
        provider: ContractProvider,
        via: Sender,
        to: Address,
        JettonAntiBot_amount: bigint,
        forward_ton_amount: bigint,
        total_ton_amount: bigint,
    ) {
        if (total_ton_amount <= forward_ton_amount) {
            throw new Error('Total ton amount should be > forward amount');
        }
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotMinter.mintMessage(
                this.address,
                to,
                JettonAntiBot_amount,
                forward_ton_amount,
                total_ton_amount,
            ),
            value: total_ton_amount + toNano('0.015'),
        });
    }

    /* provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;
     */
    static discoveryMessage(owner: Address, include_address: boolean) {
        return beginCell()
            .storeUint(0x2c76b973, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(owner)
            .storeBit(include_address)
            .endCell();
    }

    async sendDiscovery(
        provider: ContractProvider,
        via: Sender,
        owner: Address,
        include_address: boolean,
        value: bigint = toNano('0.1'),
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotMinter.discoveryMessage(owner, include_address),
            value: value,
        });
    }

    static changeAdminMessage(newOwner: Address) {
        return beginCell()
            .storeUint(Op.change_admin, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(newOwner)
            .endCell();
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotMinter.changeAdminMessage(newOwner),
            value: toNano('0.05'),
        });
    }
    static changeContentMessage(content: Cell) {
        return beginCell()
            .storeUint(Op.change_content, 32)
            .storeUint(0, 64) // op, queryId
            .storeRef(content)
            .endCell();
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, content: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotMinter.changeContentMessage(content),
            value: toNano('0.05'),
        });
    }

    static changeAntiBotMessage(anti_bot: Address) {
        return beginCell()
            .storeUint(Op.change_anti_bot, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(anti_bot)
            .endCell();
    }

    async sendChangeAntiBot(provider: ContractProvider, via: Sender, anti_bot: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonAntiBotMinter.changeAntiBotMessage(anti_bot),
            value: toNano('0.05'),
        });
    }

    async sendUpdateWhiteList(
        provider: ContractProvider,
        via: Sender,
        user: Address,
        forward_ton_amount: bigint,
        isWhiteList: number,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.update_white_list, 32)
                .storeUint(0, 64) // op, queryId
                .storeAddress(user)
                .storeCoins(forward_ton_amount)
                .storeInt(isWhiteList, 32)
                .endCell(),
            value: toNano('0.05'),
        });
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return res.stack.readAddress();
    }

    async getJettonAntiBotData(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data', []);
        let totalSupply = res.stack.readBigNumber();
        let mintable = res.stack.readBoolean();
        let adminAddress = res.stack.readAddress();
        let content = res.stack.readCell();
        let walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getTotalSupply(provider: ContractProvider) {
        let res = await this.getJettonAntiBotData(provider);
        return res.totalSupply;
    }
    async getAdminAddress(provider: ContractProvider) {
        let res = await this.getJettonAntiBotData(provider);
        return res.adminAddress;
    }
    async getContent(provider: ContractProvider) {
        let res = await this.getJettonAntiBotData(provider);
        return res.content;
    }
}
