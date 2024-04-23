import { compile, NetworkProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import { promptAddress, promptUrl } from "../helpers/utils";
import { jettonAntiBotContentToCell, JettonAntiBotMinter } from '../wrappers/JettonAntiBotMinter';
import { AntiBotConfig, antiBotConfigToCell } from '../wrappers/AntiBot';


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const urlPrompt = `Please specify content `;
    const contentUrl = await promptUrl(urlPrompt, ui);
    const antiBotConfig: AntiBotConfig = {
        owner: provider.sender().address!,
        amount_limit_per_trade: 20n,
        amount_limit_per_block: 10000n,
        time_limit_per_trade: 10n,
        disable_time: 100000n
    };

    const content = jettonAntiBotContentToCell({
        type: 1,
        uri: contentUrl,
        antiBotData: antiBotConfigToCell(antiBotConfig)
    });

    const contract = provider.open(JettonAntiBotMinter.createFromConfig({
        admin: provider.sender().address!,
        anti_bot_address: Address.parse('EQCdFzCjGyYzryFJu_Q9jDXAQwahCs_CzRhHYyg1bGnteUmZ'),
        content: content,
        wallet_code: await compile('JettonAntiBotWallet'),
    }, await compile('JettonAntiBotMinter')));

    await contract.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(contract.address);

    // await contract.sendMint(provider.sender(), provider.sender().address!, 1000n, toNano(0.1), toNano(0.2));


}