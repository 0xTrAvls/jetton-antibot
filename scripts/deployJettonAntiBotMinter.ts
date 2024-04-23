import { compile, NetworkProvider } from '@ton/blueprint';
import { Address, beginCell, toNano } from '@ton/core';
import { promptAddress, promptUrl } from '../helpers/utils';
import { antiBotDataToCell, jettonAntiBotContentToCell, JettonAntiBotMinter } from '../wrappers/JettonAntiBotMinter';

export async function run(provider: NetworkProvider) {
    const content = jettonAntiBotContentToCell({
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

    const contract = provider.open(JettonAntiBotMinter.createFromConfig({
        admin: provider.sender().address!,
        content: content,
        wallet_code: await compile('JettonAntiBotWallet'),
    }, await compile('JettonAntiBotMinter')));

    await contract.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(contract.address);

    // await contract.sendMint(provider.sender(), provider.sender().address!, 1000n, toNano(0.1), toNano(0.2));


}